import { Controller, Post, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DiaryLogDocument } from '../../../farm/infrastructure/persistence/diary-log.schema';
import { KnowledgeSourceDocument } from '../../../knowledge/infrastructure/persistence/knowledge-source.schema';
import * as crypto from 'crypto';

@Controller('api/v1/admin/ai/embeddings')
export class AiAdminController {
  constructor(
    @InjectModel('DiaryLogDocument') // Assuming these string tokens match or use the actual class tokens
    private readonly diaryLogModel: Model<DiaryLogDocument>,
    @InjectModel('KnowledgeSourceDocument')
    private readonly knowledgeSourceModel: Model<KnowledgeSourceDocument>,
    @InjectQueue('embedding_queue')
    private readonly embedQueue: Queue,
  ) {}

  @Post('rebuild')
  async rebuildEmbeddings() {
    let enqueuedCount = 0;

    // 1. Re-enqueue all diary logs
    const logs = await this.diaryLogModel.find({}).exec();
    for (const log of logs) {
      if (!log.content) continue;
      // We need to fetch userId somehow for metadata...
      // Or we can just enqueue and let the worker fetch?
      // Actually, since this is a script, we might need to populate 'diary_id.plot_id.user_id'
      // For MVP script, let's just enqueue without metadata, but search requires metadata->>'user_id'!
      // So we must fetch the plot.
      const populatedLog = await this.diaryLogModel
        .findById(log._id)
        .populate({
          path: 'diary_id',
          populate: { path: 'plot_id' },
        })
        .exec();

      if (!populatedLog) continue;

      const diary = populatedLog.diary_id as any;
      const userId = diary?.plot_id?.user_id;

      if (userId) {
        const contentHash = crypto
          .createHash('sha256')
          .update(log.content)
          .digest('hex');
        await this.embedQueue.add(
          'embed_document',
          {
            sourceId: log._id.toString(),
            sourceType: 'diary_log',
            text: log.content,
            metadata: { user_id: userId },
          },
          { jobId: `embed-diary_log-${log._id}-${contentHash}` },
        );
        enqueuedCount++;
      }
    }

    // 2. Re-enqueue all knowledge sources
    const sources = await this.knowledgeSourceModel.find({}).exec();
    for (const source of sources) {
      if (!source.content) continue;
      const contentHash = crypto
        .createHash('sha256')
        .update(source.content)
        .digest('hex');
      await this.embedQueue.add(
        'embed_document',
        {
          sourceId: source._id.toString(),
          sourceType: 'knowledge_source',
          text: source.content,
        },
        { jobId: `embed-knowledge_source-${source._id}-${contentHash}` },
      );
      enqueuedCount++;
    }

    return { message: `Rebuild started. Enqueued ${enqueuedCount} documents.` };
  }
}
