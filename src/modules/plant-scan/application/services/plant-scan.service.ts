import { Injectable, Logger, HttpStatus, HttpException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as crypto from 'crypto';
import { PlantScanDocument } from '../../infrastructure/persistence/plant-scan.schema';
import { RateLimiterService } from '../../../../common/rate-limiter/rate-limiter.service';
import { LLMService } from '../../../ai/application/services/llm.service';
import { PromptService } from '../../../ai/application/services/prompt.service';
import { R2StorageService } from '../../../storage/r2-storage.service';
import { ImageProcessorService } from './image-processor.service';
import { appConfig } from '../../../../config/app.config';
import {
  PlantScanGuardrailService,
  GeminiDiagnosisSchema,
} from './plant-scan-guardrail.service';
import { PetService } from '../../../pet/application/services/pet.service';
import { PetMood } from '../../../pet/infrastructure/persistence/pet-state.schema';
import { PROMPT_VERSIONS } from '../../../ai/domain/prompt.constants';

@Injectable()
export class PlantScanService {
  private readonly logger = new Logger(PlantScanService.name);

  constructor(
    @InjectModel('PlantScanDocument')
    private readonly scanModel: Model<PlantScanDocument>,
    private readonly rateLimiter: RateLimiterService,
    private readonly llmService: LLMService,
    private readonly promptService: PromptService,
    private readonly storageService: R2StorageService,
    private readonly imageProcessor: ImageProcessorService,
    private readonly guardrailService: PlantScanGuardrailService,
    private readonly petService: PetService,
  ) {}

  async diagnose(
    file: any,
    cropType: string,
    userId: string,
    tier: string = 'free',
    context?: {
      plantPart?: string;
      symptomDuration?: string;
      progression?: string;
      notes?: string;
    },
  ) {
    const startedAt = Date.now();
    // 1. Validate magic bytes
    await this.imageProcessor.validateImageMagicBytes(file.buffer);

    // 2. User daily quota check (checked in controller, but we can double check or rely on controller. The spec says enforce in controller, but we'll do it here for encapsulation)
    const dateStr = new Date().toISOString().slice(0, 10);
    const quotaKey = `scan:limit:${userId}:${dateStr}`;
    const config = appConfig();
    const dailyLimit =
      tier === 'premium'
        ? config.plantScan.premiumDailyLimit
        : config.plantScan.freeDailyLimit;
    const rateLimit = await this.rateLimiter.consume(
      quotaKey,
      dailyLimit,
      86400,
    );

    if (!rateLimit.allowed) {
      throw new HttpException(
        {
          success: false,
          statusCode: 429,
          errorCode: 'SCAN_QUOTA_EXCEEDED',
          message: `Đã dùng hết ${dailyLimit} lượt quét hôm nay.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Blur check
    const isBlurry = await this.imageProcessor.checkBlurry(file.buffer);
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

    // 4. Optimize image & compute pHash
    const optimizedBuffer = await this.imageProcessor.optimizeImage(
      file.buffer,
    );
    const pHash = await this.imageProcessor.computePHash(optimizedBuffer);

    // 5. pHash cache lookup (MongoDB last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentScans = await this.scanModel
      .find({
        user_id: userId,
        crop_type: cropType,
        status: 'completed',
        prompt_version: PROMPT_VERSIONS.vision,
        created_at: { $gte: sevenDaysAgo },
      })
      .exec();

    for (const scan of recentScans) {
      if (!scan.p_hash) continue;
      const distance = this.imageProcessor.hammingDistance(pHash, scan.p_hash);
      if (distance < 10) {
        this.logger.log(`pHash Cache Hit! Similarity distance: ${distance}`);
        // Cache hit consumes quota but skips LLM/R2
        const freshImageUrl = scan.image_key
          ? await this.storageService.getSignedUrl(scan.image_key)
          : undefined;
        const freshThumbnailUrl = scan.thumbnail_key
          ? await this.storageService.getSignedUrl(scan.thumbnail_key)
          : undefined;

        return {
          scan_id: scan._id,
          status: 'cached',
          crop_type: cropType,
          diagnosis: scan.diagnosis,
          image_url: freshImageUrl,
          thumbnail_url: freshThumbnailUrl,
          cache_hit_from_scan_id: scan._id,
        };
      }
    }

    // 6. Cache miss -> check Gemini Quota
    const currentMinute = new Date().toISOString().slice(0, 16);
    const rpmKey = `gemini:vision:rpm:${currentMinute}`;
    const rpdKey = `gemini:vision:rpd:${dateStr}`;

    // We assume limits like 15 RPM, 1500 RPD
    const rpmLimit = await this.rateLimiter.consume(
      rpmKey,
      config.plantScan.geminiRpmLimit,
      60,
    );
    const rpdLimit = await this.rateLimiter.consume(
      rpdKey,
      config.plantScan.geminiRpdLimit,
      86400,
    );

    if (!rpmLimit.allowed || !rpdLimit.allowed) {
      throw new HttpException(
        {
          success: false,
          statusCode: 429,
          errorCode: 'AI_SCAN_QUOTA_BUSY',
          message: 'Hệ thống AI đang quá tải. Vui lòng thử lại sau vài phút.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 7. Upload to R2
    const fileId = crypto.randomUUID();
    const imageKey = `scans/${userId}/${fileId}.webp`;
    const thumbnailKey = `scans/${userId}/${fileId}-thumb.webp`;

    await this.storageService.uploadFile(
      optimizedBuffer,
      imageKey,
      'image/webp',
    );
    const thumbnailBuffer =
      await this.imageProcessor.createThumbnail(optimizedBuffer);
    await this.storageService.uploadFile(
      thumbnailBuffer,
      thumbnailKey,
      'image/webp',
    );

    // 8. Call LLM Vision
    const imageContext = [
      context?.plantPart && `Bộ phận được chụp: ${context.plantPart}`,
      context?.symptomDuration && `Triệu chứng xuất hiện: ${context.symptomDuration}`,
      context?.progression && `Diễn biến: ${context.progression}`,
      context?.notes && `Ghi chú bổ sung: ${context.notes}`,
    ]
      .filter(Boolean)
      .join('\n');
    const builtPrompt = this.promptService.buildVisionPrompt({
      cropType,
      imageContext,
    });
    let llmResult;
    try {
      llmResult = await this.llmService.completeVision({
        prompt: builtPrompt.prompt,
        promptVersion: builtPrompt.promptVersion,
        imageBuffer: optimizedBuffer,
        mimeType: 'image/webp',
        userId,
      });
    } catch (e) {
      this.logger.error('Gemini Vision failed', e);
      return await this.saveFailedScan(
        userId,
        cropType,
        imageKey,
        thumbnailKey,
        pHash,
        'LLM_ERROR',
        startedAt,
      );
    }

    let rawText = llmResult.text;
    if (rawText.includes('```')) {
      rawText = rawText
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(rawText);
    } catch (e) {
      this.logger.error('Failed to parse Gemini Vision response:', rawText);
      return await this.saveFailedScan(
        userId,
        cropType,
        imageKey,
        thumbnailKey,
        pHash,
        'INVALID_JSON',
        startedAt,
      );
    }

    // 9. Zod Validation
    const validationResult = GeminiDiagnosisSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      this.logger.error('Zod validation failed:', validationResult.error);
      return await this.saveFailedScan(
        userId,
        cropType,
        imageKey,
        thumbnailKey,
        pHash,
        'INVALID_SCHEMA',
        startedAt,
      );
    }

    const diagnosisResult = validationResult.data;

    // 10. Handle is_plant=false
    if (diagnosisResult.is_plant === false) {
      await this.saveFailedScanRecord(
        userId,
        cropType,
        imageKey,
        thumbnailKey,
        pHash,
        'NOT_A_PLANT_IMAGE',
        startedAt,
      );
      throw new HttpException(
        {
          success: false,
          statusCode: 422,
          errorCode: 'NOT_A_PLANT_IMAGE',
          message: 'Ảnh không phải là cây trồng',
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // 11. Apply Safety Guardrails & warnings
    const finalDiagnosis =
      this.guardrailService.applyBVTVGuardrail(diagnosisResult);

    // 12. Save to MongoDB
    const scanId = crypto.randomUUID();
    const scanDoc = new this.scanModel({
      _id: scanId,
      user_id: userId,
      status: 'completed',
      image_key: imageKey,
      thumbnail_key: thumbnailKey,
      p_hash: pHash,
      crop_type: cropType,
      diagnosis: finalDiagnosis,
      model_used: config.plantScan.model,
      prompt_version: builtPrompt.promptVersion,
      latency_ms: Date.now() - startedAt,
      cached: false,
    });

    try {
      await scanDoc.save();
    } catch (e) {
      this.logger.error(
        'Failed to save scan to MongoDB. Deleting R2 objects...',
        e,
      );
      await this.storageService.deleteFile(imageKey);
      await this.storageService.deleteFile(thumbnailKey);
      throw new HttpException(
        {
          success: false,
          statusCode: 500,
          errorCode: 'PLANT_SCAN_PERSISTENCE_FAILED',
          message: 'Lỗi lưu trữ dữ liệu',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (
      finalDiagnosis.disease_name &&
      typeof finalDiagnosis.confidence === 'number' &&
      finalDiagnosis.confidence >= 0.7
    ) {
      try {
        await this.petService.updateMood(
          userId,
          PetMood.WORRIED,
          `PlantScan phát hiện ${finalDiagnosis.disease_name}`,
        );
      } catch (e) {
        this.logger.warn(
          `Failed to sync pet mood after PlantScan: ${String(e)}`,
        );
      }
    }

    const imageUrl = await this.storageService.getSignedUrl(imageKey);
    const thumbnailUrl = await this.storageService.getSignedUrl(thumbnailKey);

    return {
      scan_id: scanId,
      status: 'completed',
      crop_type: cropType,
      diagnosis: finalDiagnosis,
      image_url: imageUrl,
      thumbnail_url: thumbnailUrl,
    };
  }

  private async saveFailedScanRecord(
    userId: string,
    cropType: string,
    imageKey: string,
    thumbnailKey: string,
    pHash: string,
    errorCode: string,
    startedAt: number,
  ) {
    const scanDoc = new this.scanModel({
      _id: crypto.randomUUID(),
      user_id: userId,
      status: 'failed',
      image_key: imageKey,
      thumbnail_key: thumbnailKey,
      p_hash: pHash,
      crop_type: cropType,
      error_code: errorCode,
      latency_ms: Date.now() - startedAt,
      cached: false,
    });
    try {
      await scanDoc.save();
    } catch (e) {
      this.logger.error('Failed to save failed scan record', e);
      // Best-effort
      await this.storageService.deleteFile(imageKey);
      await this.storageService.deleteFile(thumbnailKey);
    }
  }

  private async saveFailedScan(
    userId: string,
    cropType: string,
    imageKey: string,
    thumbnailKey: string,
    pHash: string,
    errorCode: string,
    startedAt: number,
  ) {
    await this.saveFailedScanRecord(
      userId,
      cropType,
      imageKey,
      thumbnailKey,
      pHash,
      errorCode,
      startedAt,
    );
    throw new HttpException(
      {
        success: false,
        statusCode: 500,
        errorCode,
        message: 'Hệ thống AI gặp sự cố',
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async getScanById(scanId: string, userId: string) {
    const scan = await this.scanModel
      .findOne({ _id: scanId, user_id: userId })
      .exec();
    if (!scan) {
      throw new HttpException(
        {
          success: false,
          statusCode: 404,
          errorCode: 'SCAN_NOT_FOUND',
          message: 'Không tìm thấy kết quả quét',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const imageUrl = scan.image_key
      ? await this.storageService.getSignedUrl(scan.image_key)
      : undefined;
    const thumbnailUrl = scan.thumbnail_key
      ? await this.storageService.getSignedUrl(scan.thumbnail_key)
      : undefined;

    return {
      scan_id: scan._id,
      status: scan.status,
      crop_type: scan.crop_type,
      diagnosis: scan.diagnosis,
      image_url: imageUrl,
      thumbnail_url: thumbnailUrl,
      created_at: (scan as any).created_at,
    };
  }

  async getScans(userId: string, requestedLimit = 30) {
    const limit = Math.min(Math.max(requestedLimit, 1), 50);
    const [scans, total] = await Promise.all([
      this.scanModel
        .find({ user_id: userId, status: 'completed' })
        .sort({ created_at: -1 })
        .limit(limit)
        .exec(),
      this.scanModel.countDocuments({ user_id: userId, status: 'completed' }),
    ]);

    const items = await Promise.all(
      scans.map(async (scan) => ({
        scan_id: scan._id,
        status: scan.cache_hit_from_scan_id ? 'cached' : 'completed',
        crop_type: scan.crop_type,
        diagnosis: scan.diagnosis,
        image_url: scan.image_key
          ? await this.storageService.getSignedUrl(scan.image_key)
          : undefined,
        thumbnail_url: scan.thumbnail_key
          ? await this.storageService.getSignedUrl(scan.thumbnail_key)
          : undefined,
        cache_hit_from_scan_id: scan.cache_hit_from_scan_id,
        created_at: (scan as any).created_at,
      })),
    );

    return { items, total };
  }
}
