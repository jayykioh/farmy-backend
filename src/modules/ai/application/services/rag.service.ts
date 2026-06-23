import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LLMService } from './llm.service';
import { KnowledgeSourceDocument } from '../../../knowledge/infrastructure/persistence/knowledge-source.schema';
import { DiaryLogDocument } from '../../../farm/infrastructure/persistence/diary-log.schema';
import { EmbeddingRepository, SearchHit } from '../../infrastructure/persistence/embedding.repository';

export interface Citation {
  source_id: string;
  source_type: 'diary_entry' | 'knowledge_doc';
  title: string;
  score: number;
  date?: string;
}

export interface RAGContext {
  context_text: string;
  citations: Citation[];
  has_context: boolean;
}

export const RAG_CONFIG = {
  minScore: parseFloat(process.env.RAG_MIN_SCORE ?? '0.5'),
  topK: parseInt(process.env.RAG_TOP_K ?? '6'),
};

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly embeddingRepository: EmbeddingRepository,
    @InjectModel(KnowledgeSourceDocument.name)
    private readonly knowledgeModel: Model<KnowledgeSourceDocument>,
    @InjectModel(DiaryLogDocument.name)
    private readonly diaryLogModel: Model<DiaryLogDocument>,
  ) {}

  async retrieveContext(userMessage: string, userId: string): Promise<RAGContext> {
    try {
      // Step 1: Embed query
      const { vector } = await this.llmService.embed(userMessage);

      // Step 2: Use pgvector to find similar chunks
      const hits = await this.embeddingRepository.searchSimilar(
        vector,
        { limit: RAG_CONFIG.topK, minScore: RAG_CONFIG.minScore },
        userId,
      );

      if (hits.length === 0) {
        return { context_text: '', citations: [], has_context: false };
      }

      const citations: Citation[] = [];
      const contextTexts: string[] = [];

      // Step 3: Fetch full text content from MongoDB
      for (const hit of hits) {
        if (hit.source_type === 'knowledge_source') {
          const doc = await this.knowledgeModel.findById(hit.source_id).exec();
          if (doc) {
            contextTexts.push(`[Tài liệu: ${doc.title}] ${doc.content}`);
            citations.push({
              source_id: doc._id.toString(),
              source_type: 'knowledge_doc',
              title: doc.title,
              score: hit.score,
            });
          }
        } else if (hit.source_type === 'diary_log') {
          const log = await this.diaryLogModel.findById(hit.source_id).exec();
          if (log) {
            const dateStr = (log as any).created_at
              ? new Date((log as any).created_at).toLocaleDateString('vi-VN')
              : new Date().toLocaleDateString('vi-VN');
            contextTexts.push(`[Nhật ký ngày ${dateStr} - ${log.activity_type}] ${log.content}`);
            citations.push({
              source_id: log._id.toString(),
              source_type: 'diary_entry',
              title: `Nhật ký ${dateStr}`,
              score: hit.score,
              date: dateStr,
            });
          }
        }
      }

      return {
        context_text: contextTexts.join('\n\n'),
        citations,
        has_context: contextTexts.length > 0,
      };
    } catch (err) {
      this.logger.error('Error in retrieveContext:', err);
      return { context_text: '', citations: [], has_context: false };
    }
  }
}
