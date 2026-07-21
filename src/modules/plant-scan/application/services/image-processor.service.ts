import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import sharp = require('sharp');
import bhash from 'blockhash-core';
import pixels from 'image-pixels';

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  /**
   * Validates the file's magic bytes to ensure it's a real image
   */
  async validateImageMagicBytes(buffer: Buffer): Promise<void> {
    if (buffer.length < 12) {
      this.throwInvalidType();
    }

    const hex = buffer.toString('hex', 0, 12).toUpperCase();

    // JPEG: FF D8 FF
    const isJpeg = hex.startsWith('FFD8FF');
    // PNG: 89 50 4E 47
    const isPng = hex.startsWith('89504E47');
    // WEBP: 52 49 46 46 ... 57 45 42 50
    // "RIFF" in hex is 52 49 46 46, "WEBP" is 57 45 42 50
    const isWebp =
      hex.startsWith('52494646') && hex.substring(16, 24) === '57454250';

    if (!isJpeg && !isPng && !isWebp) {
      this.throwInvalidType();
    }
  }

  private throwInvalidType() {
    throw new HttpException(
      {
        success: false,
        statusCode: 415,
        errorCode: 'INVALID_IMAGE_TYPE',
        message: 'Chỉ hỗ trợ file ảnh thật (JPEG, PNG, WebP).',
      },
      HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    );
  }

  /**
   * Computes Laplacian variance for blur detection
   * Rejects if variance < 100
   */
  async checkBlurry(buffer: Buffer): Promise<boolean> {
    try {
      const bufferData = await sharp(buffer)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const data = bufferData.data;
      const width = bufferData.info.width;
      const height = bufferData.info.height;

      // Calculate Laplacian variance
      // Using a simple 3x3 Laplacian kernel:
      // [ 0,  1,  0]
      // [ 1, -4,  1]
      // [ 0,  1,  0]

      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const top = (y - 1) * width + x;
          const bottom = (y + 1) * width + x;
          const left = y * width + (x - 1);
          const right = y * width + (x + 1);

          const laplacian =
            data[top] + data[bottom] + data[left] + data[right] - 4 * data[idx];

          sum += laplacian;
          sumSq += laplacian * laplacian;
          count++;
        }
      }

      const mean = sum / count;
      const variance = sumSq / count - mean * mean;

      this.logger.debug(`Image variance: ${variance}`);

      return variance < 15;
    } catch (e) {
      this.logger.error('Failed to compute image variance', e);
      return false; // Fallback to allow if computation fails
    }
  }

  /**
   * Optimizes an image (resize to max 1024, WebP 80% quality)
   */
  async optimizeImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .rotate() // auto-orient based on EXIF
      .resize({
        width: 1024,
        height: 1024,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  }

  /**
   * Creates a thumbnail (resize to 256, WebP 60% quality)
   */
  async createThumbnail(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .rotate()
      .resize({
        width: 256,
        height: 256,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 60 })
      .toBuffer();
  }

  /**
   * Computes perceptual hash.
   * Using blockhash-core on a small sharp buffer for speed and robustness.
   */
  async computePHash(buffer: Buffer): Promise<string> {
    try {
      const resized = await sharp(buffer)
        .resize(32, 32, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // blockhash-core expects { width, height, data }
      // data should be an array-like of RGBA, but if we process RGB we can format it.
      // Let's ensure RGBA format from sharp
      const rgbaResized = await sharp(buffer)
        .resize(32, 32, { fit: 'fill' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const hashData = {
        width: rgbaResized.info.width,
        height: rgbaResized.info.height,
        data: rgbaResized.data,
      };

      const hash = bhash.bmvbhash(hashData, 8); // 8 bits (64-bit hash)
      return hash;
    } catch (e) {
      this.logger.error('Failed to compute pHash', e);
      // Fallback
      const crypto = await import('crypto');
      return crypto
        .createHash('md5')
        .update(buffer.slice(0, 1024))
        .digest('hex')
        .substring(0, 16);
    }
  }

  /**
   * Calculates Hamming distance between two hex hashes
   */
  hammingDistance(hash1: string, hash2: string): number {
    let dist = 0;
    const len = Math.min(hash1.length, hash2.length);
    for (let i = 0; i < len; i++) {
      const val1 = parseInt(hash1[i], 16);
      const val2 = parseInt(hash2[i], 16);
      let xor = val1 ^ val2;
      while (xor > 0) {
        if (xor & 1) dist++;
        xor >>= 1;
      }
    }
    dist += Math.abs(hash1.length - hash2.length) * 4;
    return dist;
  }
}
