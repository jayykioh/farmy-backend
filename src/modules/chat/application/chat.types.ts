import type { RAGContext } from '../../rag/application/rag.service';
import type { ChatMessage } from '../../ai/domain/prompt.types';

export interface PreparedChatTurn {
  sessionId: string;
  userMessageId: string;
  userId: string;
  prompt: string;
  promptVersion: string;
  retrievalStatus: RAGContext['retrieval_status'];
  citations: RAGContext['citations'];
}

export interface CompletedTurn {
  assistantMessageId: string;
}

export type BoundedChatHistory = ChatMessage[];
