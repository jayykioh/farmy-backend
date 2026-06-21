export interface EmbedDocumentPayload {
  sourceId: string;
  sourceType: string;
  text: string;
  metadata?: Record<string, any>;
}

export interface IEmbeddingProvider {
  embed(text: string): Promise<{ vector: number[] }>;
}
