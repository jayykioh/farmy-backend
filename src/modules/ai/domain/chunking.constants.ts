export interface ChunkingOptions {
  windowSize: number;
  stepSize: number;
  maxChunks: number;
  minLength?: number;
}

export const CHUNKING_PRESETS: Record<string, ChunkingOptions> = {
  diary_log: { windowSize: 300, stepSize: 100, maxChunks: 10, minLength: 20 },
  knowledge_source: {
    windowSize: 1000,
    stepSize: 200,
    maxChunks: 20,
    minLength: 0,
  },
};
