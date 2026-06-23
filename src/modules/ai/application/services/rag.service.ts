import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LLMService } from './llm.service';
import { KnowledgeSourceDocument } from '../../../knowledge/infrastructure/persistence/knowledge-source.schema';
import { DiaryLogDocument } from '../../../farm/infrastructure/persistence/diary-log.schema';
import { DiaryDocument } from '../../../farm/infrastructure/persistence/diary.schema';
import { FarmPlotDocument } from '../../../farm/infrastructure/persistence/farm-plot.schema';

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

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);

  constructor(
    private readonly llmService: LLMService,
    @InjectModel(KnowledgeSourceDocument.name)
    private readonly knowledgeModel: Model<KnowledgeSourceDocument>,
    @InjectModel(DiaryLogDocument.name)
    private readonly diaryLogModel: Model<DiaryLogDocument>,
    @InjectModel(DiaryDocument.name)
    private readonly diaryModel: Model<DiaryDocument>,
    @InjectModel(FarmPlotDocument.name)
    private readonly farmPlotModel: Model<FarmPlotDocument>,
  ) {}

  async retrieveContext(userMessage: string, userId: string): Promise<RAGContext> {
    try {
      // Step 1: Embed query
      const { vector } = await this.llmService.embed(userMessage);

      // Step 2: Fetch all user diaries & logs
      const plots = await this.farmPlotModel.find({ user_id: userId }).exec();
      const plotIds = plots.map((p) => p._id);

      const diaries = await this.diaryModel.find({ plot_id: { $in: plotIds } }).exec();
      const diaryIds = diaries.map((d) => d._id);

      const diaryLogs = await this.diaryLogModel
        .find({ diary_id: { $in: diaryIds } })
        .exec();

      // Step 3: Fetch all knowledge base documents
      const knowledgeDocs = await this.knowledgeModel.find().exec();

      // Step 4: Calculate similarities
      const hits: Array<{
        source_id: string;
        source_type: 'diary_entry' | 'knowledge_doc';
        title: string;
        score: number;
        content: string;
        date?: string;
      }> = [];

      // Add diary log hits
      for (const log of diaryLogs) {
        if (!log.content_embedding || log.content_embedding.length === 0) continue;
        // In case embedding lengths differ (e.g. 1536 seeded vs 768 from text-embedding-004), we handle it
        if (log.content_embedding.length !== vector.length) continue;
        const score = cosineSimilarity(vector, log.content_embedding);
        if (score >= RAG_CONFIG.minScore) {
          const dateStr = (log as any).created_at
            ? new Date((log as any).created_at).toLocaleDateString('vi-VN')
            : new Date().toLocaleDateString('vi-VN');
          hits.push({
            source_id: log._id,
            source_type: 'diary_entry',
            title: `Nhật ký ${dateStr}`,
            score,
            content: `[Nhật ký ngày ${dateStr} - ${log.activity_type}] ${log.content}`,
            date: dateStr,
          });
        }
      }

      // Add knowledge hits
      for (const doc of knowledgeDocs) {
        if (!doc.embedding || doc.embedding.length === 0) continue;
        if (doc.embedding.length !== vector.length) continue;
        const score = cosineSimilarity(vector, doc.embedding);
        if (score >= RAG_CONFIG.minScore) {
          hits.push({
            source_id: doc._id,
            source_type: 'knowledge_doc',
            title: doc.title,
            score,
            content: `[Tài liệu: ${doc.title}] ${doc.content}`,
          });
        }
      }

      // Sort by score descending and take topK
      hits.sort((a, b) => b.score - a.score);
      const topHits = hits.slice(0, RAG_CONFIG.topK);

      if (topHits.length === 0) {
        return { context_text: '', citations: [], has_context: false };
      }

      // Compile context text and citations
      const contextText = topHits.map((h) => h.content).join('\n\n');
      const citations = topHits.map((h) => ({
        source_id: h.source_id,
        source_type: h.source_type,
        title: h.title,
        score: h.score,
        date: h.date,
      }));

      return {
        context_text: contextText,
        citations,
        has_context: true,
      };
    } catch (err) {
      this.logger.error('Error in retrieveContext:', err);
      return { context_text: '', citations: [], has_context: false };
    }
  }
}
