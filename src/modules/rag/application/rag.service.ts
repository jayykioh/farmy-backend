import { Injectable, Logger, Inject } from '@nestjs/common';
import { EmbeddingRepository } from '../../ai/infrastructure/persistence/embedding.repository';
import type { IEmbeddingProvider } from '../../ai/domain/embedding.types';
import { PROMPT_LIMITS } from '../../ai/domain/prompt.constants';

export interface SearchHit {
  source_id: string;
  source_type: 'diary_log' | 'knowledge_source';
  chunk_index: number;
  text: string;
  content_hash: string;
  score: number;
}

export interface RAGContext {
  context_text: string;
  citations: Array<{
    source_id: string;
    source_type: 'diary_log' | 'knowledge_source';
    chunk_index: number;
    score: number;
    title?: string;
    url?: string;
  }>;
  has_context: boolean;
  retrieval_status: 'success' | 'no_match' | 'degraded';
}

import { DiaryRepository } from '../../farm/infrastructure/persistence/diary.repository';
import { KnowledgeRepository } from '../../knowledge/infrastructure/persistence/knowledge.repository';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    @Inject('IEmbeddingProvider')
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly embeddingRepository: EmbeddingRepository,
    private readonly diaryRepository: DiaryRepository,
    private readonly knowledgeRepository: KnowledgeRepository,
  ) {}

  async retrieveContext(
    userMessage: string,
    userId: string,
    limit = 5,
  ): Promise<RAGContext> {
    try {
      const { vector } = await this.embeddingProvider.embed(userMessage);

      const hits = await this.embeddingRepository.searchSimilar(
        vector,
        { limit, minScore: 0.7 },
        userId,
      );

      if (!hits || hits.length === 0) {
        return {
          context_text: '',
          citations: [],
          has_context: false,
          retrieval_status: 'no_match',
        };
      }

      const citations: RAGContext['citations'] = [];
      let contextText = '';

      for (const hit of hits) {
        const chunkContent = hit.text;
        if (!chunkContent) continue;

        const prospectiveContext =
          contextText + (contextText ? '\n\n' : '') + chunkContent;
        if (prospectiveContext.length > PROMPT_LIMITS.maxContextChars) {
          // Skip adding if it exceeds context limit
          continue;
        }

        contextText = prospectiveContext;
        citations.push({
          source_id: hit.source_id,
          source_type: hit.source_type,
          chunk_index: hit.chunk_index,
          score: hit.score,
        });
      }

      // Populate metadata for citations
      const knowledgeIds = citations
        .filter((c) => c.source_type === 'knowledge_source')
        .map((c) => c.source_id);
      const diaryIds = citations
        .filter((c) => c.source_type === 'diary_log')
        .map((c) => c.source_id);

      const [knowledgeSources, diaryLogs] = await Promise.all([
        knowledgeIds.length > 0
          ? this.knowledgeRepository.findByIds(knowledgeIds)
          : Promise.resolve([]),
        diaryIds.length > 0
          ? this.diaryRepository.findLogsByIds(diaryIds)
          : Promise.resolve([]),
      ]);

      const knowledgeMap = new Map(
        knowledgeSources.map((s) => [s._id.toString(), s]),
      );
      const diaryMap = new Map(diaryLogs.map((l) => [l._id.toString(), l]));

      for (const citation of citations) {
        if (citation.source_type === 'knowledge_source') {
          const source = knowledgeMap.get(citation.source_id);
          if (source) {
            citation.title = source.title;
            citation.url = source.source_url;
          }
        } else if (citation.source_type === 'diary_log') {
          const log = diaryMap.get(citation.source_id);
          if (log) {
            citation.title = `Nhật ký: ${log.activity_type}`;
          }
        }
      }

      return {
        context_text: contextText,
        citations,
        has_context: contextText.length > 0,
        retrieval_status: 'success',
      };
    } catch (err) {
      const error = err as Error;
      // Fail-open for infrastructure errors
      this.logger.warn(
        `Infrastructure error during RAG retrieval: ${error.message}`,
      );
      return {
        context_text: '',
        citations: [],
        has_context: false,
        retrieval_status: 'degraded',
      };
    }
  }
}
