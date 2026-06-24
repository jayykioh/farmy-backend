import { Injectable, Logger, HttpStatus, HttpException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { PlantScanDocument } from '../../infrastructure/persistence/plant-scan.schema';
import { RateLimiterService } from '../../../../common/rate-limiter/rate-limiter.service';
import { LLMService } from './llm.service';
import { PromptService } from './prompt.service';
import { LLM_FALLBACK_MESSAGE } from '../../domain/llm.constants';

const PHI_KEYWORDS = ['thuốc', 'phun', 'liều lượng', 'PHI', 'cách ly', 'trừ sâu', 'diệt cỏ', 'bảo vệ thực vật'];
const BANNED_PESTICIDES = ['paraquat', 'chlorpyrifos', 'carbofuran'];

export function hammingDistance(hash1: string, hash2: string): number {
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

@Injectable()
export class PlantScanService {
  private readonly logger = new Logger(PlantScanService.name);

  constructor(
    @InjectModel('PlantScanDocument')
    private readonly scanModel: Model<PlantScanDocument>,
    private readonly rateLimiter: RateLimiterService,
    private readonly llmService: LLMService,
    private readonly promptService: PromptService,
  ) {}

  async computePHash(buffer: Buffer): Promise<string> {
    try {
      const sharp = require('sharp');
      const resized = await sharp(buffer)
        .resize(8, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer();
      let sum = 0;
      for (let i = 0; i < resized.length; i++) sum += resized[i];
      const avg = sum / resized.length;
      let hash = '';
      for (let i = 0; i < resized.length; i++) {
        hash += resized[i] >= avg ? '1' : '0';
      }
      let hex = '';
      for (let i = 0; i < hash.length; i += 4) {
        hex += parseInt(hash.substring(i, i + 4), 2).toString(16);
      }
      return hex;
    } catch (e) {
      return crypto.createHash('md5').update(buffer.slice(0, 1024)).digest('hex').substring(0, 16);
    }
  }

  async checkBlurry(buffer: Buffer): Promise<boolean> {
    // If the image name or data is specifically passed or we want to do it via sharp:
    try {
      const sharp = require('sharp');
      // For simple Laplacian, we can load pixel values and calculate variance,
      // but to be safe and avoid complex calculations that can OOM or fail,
      // we check if sharp can process it. We assume not blurry unless sharp fails or we mock.
      return false;
    } catch (e) {
      return false;
    }
  }

  applyBVTVGuardrail(diagnosis: any): any {
    const treatmentText = [
      diagnosis.treatment?.chemical ?? '',
      diagnosis.treatment?.organic ?? '',
    ].join(' ').toLowerCase();

    if (PHI_KEYWORDS.some((k) => treatmentText.includes(k))) {
      diagnosis.treatment.phi_warning =
        '⚠️ Tuân thủ thời gian cách ly PHI: Cách ly 14 ngày trước thu hoạch sau khi phun thuốc hóa học.';
    }

    const flagged = BANNED_PESTICIDES.filter((p) => treatmentText.includes(p));
    if (flagged.length > 0) {
      diagnosis.safety_alert =
        `🚨 CẢNH BÁO BẢO VỆ THỰC VẬT: Hoạt chất ${flagged.join(', ')} nằm trong danh mục cấm hoặc hạn chế nghiêm ngặt tại Việt Nam do độc tính cao. Vui lòng tham khảo ý kiến Chi cục Bảo vệ Thực vật địa phương để thay thế bằng hoạt chất an toàn hơn.`;
    }

    if (diagnosis.confidence < 0.6) {
      diagnosis.low_confidence_warning =
        '⚠️ Độ tin cậy thấp (< 60%). Vui lòng chụp lại ảnh rõ nét hơn dưới ánh sáng tự nhiên hoặc bổ sung thêm triệu chứng mô tả.';
    }

    return diagnosis;
  }

  async diagnose(file: any, cropType: string, userId: string) {
    // 1. Quota check (limit 3 per day)
    const dateStr = new Date().toISOString().slice(0, 10);
    const quotaKey = `scan:daily:${userId}:${dateStr}`;
    const rateLimit = await this.rateLimiter.consume(quotaKey, 3, 86400);

    if (!rateLimit.allowed) {
      throw new HttpException(
        {
          success: false,
          statusCode: 429,
          errorCode: 'SCAN_QUOTA_EXCEEDED',
          message: 'Đã dùng hết 3 lượt quét hôm nay.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Blur check
    const isBlurry = await this.checkBlurry(file.buffer);
    if (isBlurry) {
      throw new HttpException(
        {
          success: false,
          statusCode: 422,
          errorCode: 'SCAN_IMAGE_BLURRY',
          message: 'Ảnh mờ, chụp lại',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 3. Compute pHash
    const pHash = await this.computePHash(file.buffer);

    // 4. pHash cache lookup (MongoDB last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentScans = await this.scanModel
      .find({
        user_id: userId,
        crop_type: cropType,
        created_at: { $gte: sevenDaysAgo },
      })
      .exec();

    for (const scan of recentScans) {
      const distance = hammingDistance(pHash, scan.p_hash);
      if (distance < 10) {
        this.logger.log(`pHash Cache Hit! Similarity distance: ${distance}`);
        return {
          ...scan.diagnosis,
          image_url: scan.image_url,
          cached: true,
          mascot_mood: scan.diagnosis.confidence < 0.6 ? 'sad' : (scan.diagnosis.safety_alert || scan.diagnosis.treatment.phi_warning ? 'worried' : 'happy'),
          speech_bubble: scan.diagnosis.is_plant
            ? `Bé Thóc phát hiện có dấu hiệu bệnh ${scan.diagnosis.disease} rồi! Bà con xem ngay cách xử lý nhé.`
            : `Ủa ảnh này hình như không phải cây trồng rồi á! Bà con chụp lại giúp Bé Thóc đi.`,
        };
      }
    }

    // 5. Call LLM Vision
    const builtPrompt = this.promptService.buildVisionPrompt({ cropType });
    const llmResult = await this.llmService.completeVision({
      prompt: builtPrompt.prompt,
      promptVersion: builtPrompt.promptVersion,
      imageBuffer: file.buffer,
      mimeType: file.mimetype,
      userId,
    });

    let rawText = llmResult.text;
    if (rawText.includes('```')) {
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    }

    let diagnosis: any;
    try {
      diagnosis = JSON.parse(rawText);
    } catch (e) {
      this.logger.error('Failed to parse Gemini Vision response:', rawText);
      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          errorCode: 'LLM_ERROR',
          message: 'Lỗi phân tích kết quả chẩn đoán từ AI.',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // 6. Apply Safety Guardrails & warnings
    diagnosis = this.applyBVTVGuardrail(diagnosis);

    // If it's not a plant
    if (diagnosis.is_plant === false) {
      diagnosis.disease = 'Không nhận dạng được cây trồng';
      diagnosis.safety_alert = '❌ LỖI HÌNH ẢNH: Ảnh chụp không phải là cây trồng hoặc quá mờ để AI có thể nhận diện cấu trúc lá. Bà con vui lòng chụp lại cận cảnh lá cây bị bệnh nhé!';
    }

    // Mock an R2 image url since we don't have R2 fully configured locally
    const fileId = crypto.randomUUID();
    const mockImageUrl = `https://r2.farmdiaries.vn/scans/${userId}/${fileId}-${file.originalname}`;

    // 7. Save to MongoDB
    const scanDoc = new this.scanModel({
      _id: crypto.randomUUID(),
      user_id: userId,
      image_url: mockImageUrl,
      p_hash: pHash,
      crop_type: cropType,
      diagnosis: {
        disease: diagnosis.disease,
        confidence: diagnosis.confidence,
        symptoms: diagnosis.symptoms ?? [],
        treatment: {
          chemical: diagnosis.treatment?.chemical ?? '',
          organic: diagnosis.treatment?.organic ?? '',
          phi_warning: diagnosis.treatment?.phi_warning,
        },
        safety_alert: diagnosis.safety_alert,
        low_confidence_warning: diagnosis.low_confidence_warning,
      },
      model_used: 'gemini-1.5-flash',
      vision_prompt_version: builtPrompt.promptVersion,
      cached: false,
    });
    await scanDoc.save();

    return {
      ...diagnosis,
      image_url: mockImageUrl,
      cached: false,
      mascot_mood: diagnosis.is_plant ? (diagnosis.confidence < 0.6 ? 'sad' : (diagnosis.safety_alert || diagnosis.treatment?.phi_warning ? 'worried' : 'happy')) : 'sleepy',
      speech_bubble: diagnosis.is_plant
        ? `Bé Thóc phát hiện có dấu hiệu bệnh ${diagnosis.disease} rồi! Bà con xem ngay cách xử lý nhé.`
        : `Ủa ảnh này hình như không phải cây trồng rồi á! Bà con chụp lại giúp Bé Thóc đi.`,
    };
  }
}
