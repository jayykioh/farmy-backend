import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { KnowledgeSourceDocument } from '../../infrastructure/persistence/knowledge-source.schema';
import { CreateKnowledgeDto } from '../dto/create-knowledge.dto';
import { UpdateKnowledgeDto } from '../dto/update-knowledge.dto';
import { BatchEmbedKnowledgeDto } from '../dto/batch-embed-knowledge.dto';
import type { EmbedDocumentPayload } from '../../../ai/domain/embedding.types';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectModel(KnowledgeSourceDocument.name)
    private readonly knowledgeModel: Model<KnowledgeSourceDocument>,
    @InjectQueue('embedding_queue')
    private readonly embeddingQueue: Queue<EmbedDocumentPayload>,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────────

  async create(dto: CreateKnowledgeDto): Promise<KnowledgeSourceDocument> {
    const doc = new this.knowledgeModel({
      _id: randomUUID(),
      ...dto,
      metadata: dto.metadata ?? {},
      embed_status: 'pending',
      validation_status: 'unvalidated', // v2: mới tạo chưa qua AI review
      language: 'unknown',
    });
    await doc.save();
    this.logger.log({ action: 'knowledge.create', id: doc._id });
    return doc;
  }

  async findAll(opts?: {
    category?: string;
    validationStatus?: KnowledgeSourceDocument['validation_status'];
    limit?: number;
    skip?: number;
  }): Promise<KnowledgeSourceDocument[]> {
    const filter: Record<string, unknown> = {};
    if (opts?.category) filter.category = opts.category;
    if (opts?.validationStatus)
      filter.validation_status = opts.validationStatus;

    return this.knowledgeModel
      .find(filter)
      .skip(opts?.skip ?? 0)
      .limit(opts?.limit ?? 50)
      .sort({ created_at: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string): Promise<KnowledgeSourceDocument> {
    const doc = await this.knowledgeModel.findById(id).lean().exec();
    if (!doc) {
      throw new NotFoundException(`KnowledgeSource "${id}" not found`);
    }
    return doc;
  }

  async update(
    id: string,
    dto: UpdateKnowledgeDto,
  ): Promise<KnowledgeSourceDocument> {
    const updates: Record<string, unknown> = { ...dto };

    // v2: Nếu nội dung thay đổi → reset toàn bộ validation pipeline
    if (dto.content !== undefined) {
      updates.validation_status = 'unvalidated';
      updates.validation_report = null;
      updates.language = 'unknown';
      updates.embed_status = 'pending';
      updates.admin_note = null;
    }

    const updated = await this.knowledgeModel
      .findByIdAndUpdate(id, updates, { new: true, runValidators: true })
      .lean()
      .exec();
    if (!updated) {
      throw new NotFoundException(`KnowledgeSource "${id}" not found`);
    }
    this.logger.log({ action: 'knowledge.update', id });
    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.knowledgeModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`KnowledgeSource "${id}" not found`);
    }
    this.logger.log({ action: 'knowledge.delete', id });
  }

  // ─── Batch Embed ─────────────────────────────────────────────────────────────

  /**
   * Dispatch BullMQ embedding jobs for the given IDs (or all pending docs).
   * Returns the number of jobs enqueued.
   */
  async batchEmbed(
    dto?: BatchEmbedKnowledgeDto,
  ): Promise<{ queued: number; skipped_unconfirmed: number }> {
    let candidates: KnowledgeSourceDocument[];

    if (dto?.ids?.length) {
      candidates = await this.knowledgeModel
        .find({ _id: { $in: dto.ids } })
        .lean()
        .exec();

      const missing = dto.ids.filter(
        (id) => !candidates.find((d) => d._id === id),
      );
      if (missing.length) {
        throw new BadRequestException(
          `Unknown knowledge IDs: ${missing.join(', ')}`,
        );
      }
    } else {
      // v2: Chỉ embed bài đã confirmed và chưa embed
      candidates = await this.knowledgeModel
        .find({
          validation_status: 'confirmed',
          embed_status: { $in: ['pending', 'error'] },
        })
        .lean()
        .exec();
    }

    // v2: Lọc bài chưa confirmed
    const confirmed = candidates.filter(
      (d) => d.validation_status === 'confirmed',
    );
    const skipped = candidates.length - confirmed.length;

    if (skipped > 0) {
      this.logger.warn({
        action: 'knowledge.batchEmbed.skipped',
        reason: 'validation_status !== confirmed',
        skipped_ids: candidates
          .filter((d) => d.validation_status !== 'confirmed')
          .map((d) => d._id),
      });
    }

    if (confirmed.length === 0) {
      return { queued: 0, skipped_unconfirmed: skipped };
    }

    // Mark as "processing" trước khi dispatch
    const ids = confirmed.map((d) => d._id);
    await this.knowledgeModel.updateMany(
      { _id: { $in: ids } },
      { embed_status: 'processing' },
    );

    // Enqueue 1 BullMQ job / document
    const jobs = confirmed.map((doc) => ({
      name: 'embed-knowledge',
      data: {
        sourceId: doc._id,
        sourceType: 'knowledge_source',
        text: doc.content,
        metadata: {
          title: doc.title,
          category: doc.category,
          source_url: doc.source_url,
          language: doc.language,
        },
      } satisfies EmbedDocumentPayload,
    }));

    await this.embeddingQueue.addBulk(jobs);

    this.logger.log({
      action: 'knowledge.batchEmbed',
      queued: confirmed.length,
      skipped_unconfirmed: skipped,
    });
    return { queued: confirmed.length, skipped_unconfirmed: skipped };
  }

  /**
   * Called by EmbeddingProcessor (or a webhook) after embedding succeeds/fails.
   * Updates embed_status in MongoDB for the given sourceId.
   */
  async markEmbedStatus(
    sourceId: string,
    status: 'done' | 'error',
  ): Promise<void> {
    await this.knowledgeModel
      .findByIdAndUpdate(sourceId, { embed_status: status })
      .exec();
  }
}
