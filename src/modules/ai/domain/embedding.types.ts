export interface EmbedDocumentPayload {
  sourceId: string;
  sourceType: string;
  text: string;
  contentHash?: string; // pre-computed sha256 of full document content (optional, for logging)
  metadata?: Record<string, any>;
}

export interface IEmbeddingProvider {
  embed(text: string): Promise<{ vector: number[] }>;
}
