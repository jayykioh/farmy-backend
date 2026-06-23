/**
 * knowledge.entity.ts
 *
 * Domain entity for a KnowledgeSource document stored in MongoDB.
 * Mirrors the schema defined in knowledge-source.schema.ts but decoupled
 * from Mongoose so that application-layer services can remain framework-agnostic.
 */
export interface KnowledgeEntity {
  /** MongoDB ObjectId (string representation) */
  _id: string;
  title: string;
  content: string;
  category: string;
  source_url?: string;
  metadata: Record<string, unknown>;
  /** Embedding status — set after batch-embed job completes */
  embed_status: 'pending' | 'processing' | 'done' | 'error';
  created_at: Date;
  updated_at: Date;
}
