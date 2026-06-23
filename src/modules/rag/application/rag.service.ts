import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingRepository } from '../../ai/infrastructure/persistence/embedding.repository';
import { ChunkingService } from '../../ai/application/services/chunking.service';
import { CHUNKING_PRESETS } from '../../ai/domain/chunking.constants';
import { DiaryService } from '../../farm/application/services/diary.service';
import { KnowledgeRepository } from '../../knowledge/infrastructure/persistence/knowledge.repository';
import * as crypto from 'crypto';
import type { IEmbeddingProvider } from '../../ai/domain/embedding.types';
import { Inject } from '@nestjs/common';

export interface SearchHit {
  source_id: string;
  source_type: 'diary_log' | 'knowledge_source';
  chunk_index: number;
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
  }>;
  has_context: boolean;
  retrieval_status: 'success' | 'no_match' | 'degraded';
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  // A simple in-memory cache for knowledge chunks to simulate Redis if not available.
  // In production with Redis, you'd use @Inject(CACHE_MANAGER) Cache
  private knowledgeCache = new Map<string, string>();

  constructor(
    @Inject('IEmbeddingProvider')
    private readonly embeddingProvider: IEmbeddingProvider,
    private readonly embeddingRepository: EmbeddingRepository,
    private readonly chunkingService: ChunkingService,
    private readonly diaryService: DiaryService,
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
      const MAX_CONTEXT_LENGTH = 6000;

      for (const hit of hits) {
        let chunkContent = '';

        if (hit.source_type === 'knowledge_source') {
          chunkContent = await this.getKnowledgeChunk(hit);
        } else if (hit.source_type === 'diary_log') {
          chunkContent = await this.getDiaryLogChunk(userId, hit);
        }

        if (!chunkContent) continue;

        const prospectiveContext =
          contextText + (contextText ? '\n\n' : '') + chunkContent;
        if (prospectiveContext.length > MAX_CONTEXT_LENGTH) {
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

      return {
        context_text: contextText,
        citations,
        has_context: contextText.length > 0,
        retrieval_status: 'success',
      };
    } catch (err) {
      const error = err as Error;
      // Fail-open for infrastructure errors
      // You may add more specific error checks for Timeout, Quota, etc.
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

  private async getKnowledgeChunk(hit: SearchHit): Promise<string> {
    // Exact Identity Cache
    const cacheKey = `rag:knowledge:${crypto.createHash('sha256').update(`${hit.source_id}:${hit.chunk_index}:${hit.content_hash}`).digest('hex')}`;

    try {
      const cached = this.knowledgeCache.get(cacheKey);
      if (cached) return cached;
    } catch (err) {
      this.logger.warn(
        `Failed to read from cache for key ${cacheKey}: ${(err as Error).message}`,
      );
    }

    const source = await this.knowledgeRepository.findById(hit.source_id);
    if (!source || !source.content) return '';

    const preset = CHUNKING_PRESETS['knowledge_source'];
    const chunks = this.chunkingService.chunkText(source.content, preset);
    const chunkText = chunks[hit.chunk_index];

    if (chunkText) {
      try {
        // Basic cache expiration can be handled by actual Redis wrapper.
        // We simulate short-lived cache here.
        this.knowledgeCache.set(cacheKey, chunkText);
      } catch (err) {
        this.logger.warn(
          `Failed to write to cache for key ${cacheKey}: ${(err as Error).message}`,
        );
      }
    }
    return chunkText || '';
  }

  private async getDiaryLogChunk(
    userId: string,
    hit: SearchHit,
  ): Promise<string> {
    try {
      // Defense-in-depth: DiaryService.findOneLog throws if user doesn't own it
      const log = await this.diaryService.findOneLog(userId, hit.source_id);
      if (!log || !log.content) return '';

      const preset = CHUNKING_PRESETS['diary_log'];
      const chunks = this.chunkingService.chunkText(log.content, preset);
      return chunks[hit.chunk_index] || '';
    } catch (err) {
      // Could be NotFound or Forbidden (User isolation failed at DB level)
      this.logger.warn(
        `Failed to hydrate diary log ${hit.source_id} for user ${userId}: ${(err as Error).message}`,
      );
      return '';
    }
  }
}
