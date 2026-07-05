import { Test, TestingModule } from '@nestjs/testing';
import { ImageProcessorService } from './image-processor.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImageProcessorService],
    }).compile();

    service = module.get<ImageProcessorService>(ImageProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateImageMagicBytes', () => {
    it('should throw an error for non-image files (e.g. PDF/TXT bytes)', async () => {
      // Mocking a text file buffer (not a valid image format)
      const fakeImageBuffer = Buffer.from('this is not an image but just text');
      
      await expect(service.validateImageMagicBytes(fakeImageBuffer)).rejects.toThrow(
        HttpException,
      );
    });

    it('should pass for a valid image format mock', async () => {
      // A simple 1x1 GIF or PNG buffer (GIF is 47 49 46 38 39 61, PNG is 89 50 4E 47 0D 0A 1A 0A)
      // Actually we are testing JPEG/PNG/WEBP.
      const validPngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex');
      
      await expect(service.validateImageMagicBytes(validPngBytes)).resolves.not.toThrow();
    });
  });

  describe('hammingDistance', () => {
    it('should correctly calculate hamming distance', () => {
      // difference of 1 bit
      expect(service.hammingDistance('f', 'e')).toBe(1); // 1111 vs 1110
      // identical
      expect(service.hammingDistance('a1b2', 'a1b2')).toBe(0);
      // completely different
      expect(service.hammingDistance('0000', 'ffff')).toBe(16);
    });
  });
});
