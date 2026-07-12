import { ChunkingService } from './chunking.service';

describe('ChunkingService', () => {
  let chunkingService: ChunkingService;

  beforeEach(() => {
    chunkingService = new ChunkingService();
  });

  describe('chunkText', () => {
    it('should split text into chunks based on window size without overlap if step = windowSize', () => {
      const text = 'abcdefghij';
      const result = chunkingService.chunkText(text, {
        windowSize: 3,
        stepSize: 3,
        maxChunks: 10,
        minLength: 0,
      });
      expect(result).toEqual(['abc', 'def', 'ghi', 'j']);
    });

    it('should handle overlaps correctly when stepSize < windowSize', () => {
      const text = 'abcdefghij';
      // window=4, step=2 =>
      // chunk 1: 0..4 'abcd'
      // chunk 2: 2..6 'cdef'
      // chunk 3: 4..8 'efgh'
      // chunk 4: 6..10 'ghij'
      // chunk 5: 8..12 'ij' -> but loop terminates when end>=text.length, so wait:
      // When currentIndex=6, end=10. This pushes 'ghij'. Then end >= 10, loop breaks.
      const result = chunkingService.chunkText(text, {
        windowSize: 4,
        stepSize: 2,
        maxChunks: 10,
        minLength: 0,
      });
      expect(result).toEqual(['abcd', 'cdef', 'efgh', 'ghij']);
    });

    it('should handle text shorter than windowSize', () => {
      const text = 'abc';
      const result = chunkingService.chunkText(text, {
        windowSize: 5,
        stepSize: 3,
        maxChunks: 10,
        minLength: 0,
      });
      expect(result).toEqual(['abc']);
    });

    it('should return empty array for empty string', () => {
      const result = chunkingService.chunkText('', {
        windowSize: 5,
        stepSize: 3,
        maxChunks: 10,
        minLength: 0,
      });
      expect(result).toEqual([]);
    });

    it('should throw error if windowSize is less than or equal to 0', () => {
      expect(() =>
        chunkingService.chunkText('abc', {
          windowSize: 0,
          stepSize: 1,
          maxChunks: 10,
          minLength: 0,
        }),
      ).toThrow('windowSize must be greater than 0');
    });

    it('should throw error if stepSize is less than or equal to 0', () => {
      expect(() =>
        chunkingService.chunkText('abc', {
          windowSize: 5,
          stepSize: 0,
          maxChunks: 10,
          minLength: 0,
        }),
      ).toThrow('stepSize must be greater than 0');
    });

    it('should throw error if stepSize is greater than windowSize', () => {
      expect(() =>
        chunkingService.chunkText('abc', {
          windowSize: 5,
          stepSize: 6,
          maxChunks: 10,
          minLength: 0,
        }),
      ).toThrow('stepSize cannot be greater than windowSize');
    });
  });
});
