import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KnowledgeSourceDocument } from './knowledge-source.schema';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EmbeddingRepository } from '../../../ai/infrastructure/persistence/embedding.repository';
import * as crypto from 'crypto';

@Injectable()
export class KnowledgeRepository {
  constructor(
    @InjectModel(KnowledgeSourceDocument.name)
    private readonly knowledgeModel: Model<KnowledgeSourceDocument>,
    @InjectQueue('embedding_queue')
    private readonly embedQueue: Queue,
    private readonly embeddingRepository: EmbeddingRepository,
  ) {}

  async findByIds(ids: string[]): Promise<KnowledgeSourceDocument[]> {
    return this.knowledgeModel
      .find({
        _id: { $in: ids },
      })
      .exec();
  }

  async findById(id: string): Promise<KnowledgeSourceDocument | null> {
    return this.knowledgeModel.findById(id).exec();
  }

  async save(doc: KnowledgeSourceDocument): Promise<KnowledgeSourceDocument> {
    const saved = await doc.save();

    // Auto enqueue embedding job on save
    if (saved.content) {
      const contentHash = crypto
        .createHash('sha256')
        .update(saved.content)
        .digest('hex');
      await this.embedQueue.add(
        'embed_document',
        {
          sourceId: saved._id.toString(),
          sourceType: 'knowledge_source',
          text: saved.content,
        },
        { jobId: `embed-knowledge_source-${saved._id}-${contentHash}` },
      );
    }

    return saved;
  }

  async deleteById(id: string): Promise<void> {
    await this.knowledgeModel.findByIdAndDelete(id).exec();
    await this.embeddingRepository.deactivateBySourceId(id);
  }
}
