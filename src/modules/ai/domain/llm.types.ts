export interface LLMCompleteOptions {
  prompt: string;
  promptVersion: string;
  userId?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  onRateLimit?: 'fallback' | 'throw';
}

export interface LLMCompleteResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  rateLimited: boolean;
}

export interface LLMEmbedResult {
  vector: number[];
  latencyMs: number;
}

export interface VisionCompleteOptions {
  prompt: string;
  imageBuffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  promptVersion: string;
  userId?: string;
  maxTokens?: number;
  onRateLimit?: 'fallback' | 'throw';
}
