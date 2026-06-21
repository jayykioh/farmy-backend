import { Injectable } from '@nestjs/common';

export interface ChunkingOptions {
  windowSize: number;
  stepSize: number;
}

@Injectable()
export class ChunkingService {
  /**
   * Splits a large string into smaller text chunks based on configurable window and step sizes.
   * Ensures no chunk exceeds the window size and adjacent chunks overlap by the specified step size.
   */
  chunkText(text: string, options: ChunkingOptions): string[] {
    const { windowSize, stepSize } = options;
    if (windowSize <= 0) {
      throw new Error('windowSize must be greater than 0');
    }
    if (stepSize <= 0) {
      throw new Error('stepSize must be greater than 0');
    }
    if (stepSize > windowSize) {
      throw new Error('stepSize cannot be greater than windowSize');
    }

    if (!text || text.length === 0) {
      return [];
    }

    const chunks: string[] = [];
    let currentIndex = 0;

    while (currentIndex < text.length) {
      const end = Math.min(currentIndex + windowSize, text.length);
      chunks.push(text.slice(currentIndex, end));

      if (end >= text.length) {
        break;
      }

      currentIndex += stepSize;
    }

    return chunks;
  }
}
