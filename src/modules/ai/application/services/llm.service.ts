/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
import { Injectable, Logger } from '@nestjs/common';
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  type Content,
  type GenerateContentResponse,
} from '@google/genai';
import { appConfig } from '../../../../config/app.config';
import { RateLimiterService } from '../../../../common/rate-limiter/rate-limiter.service';
import {
  EmbedQuotaExceededException,
  LLMConfigurationException,
  LLMProviderException,
  LLMRateLimitedException,
} from '../../domain/llm.errors';
import {
  LLM_EMBED_RPM_KEY,
  LLM_EMBED_RPM_LIMIT,
  LLM_FALLBACK_MESSAGE,
  LLM_FLASH_RPM_KEY,
  LLM_FLASH_RPM_LIMIT,
  LLM_RPM_WINDOW_SECONDS,
  LLM_SAFETY_MESSAGE,
} from '../../domain/llm.constants';
import {
  LLMCompleteOptions,
  LLMCompleteResult,
  LLMEmbedResult,
  VisionCompleteOptions,
} from '../../domain/llm.types';
import { IEmbeddingProvider } from '../../domain/embedding.types';

type GeminiClient = InstanceType<typeof GoogleGenAI>;

@Injectable()
export class LLMService implements IEmbeddingProvider {
  private readonly logger = new Logger(LLMService.name);
  private client?: GeminiClient;

  constructor(private readonly rateLimiter: RateLimiterService) {}

  private shouldUseMockKeyFallback(): boolean {
    const cfg = appConfig();
    const key = cfg.gemini.apiKey;
    const isRealKey =
      key &&
      (key.startsWith('AIzaSy') || key.startsWith('AQ.'));
    return !isRealKey && process.env.NODE_ENV !== 'test';
  }

  async complete(options: LLMCompleteOptions): Promise<LLMCompleteResult> {
    if (this.shouldUseMockKeyFallback()) {
      const text = this.getMockResponse(options.prompt);
      return {
        text,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 50,
        rateLimited: false,
      };
    }

    const cfg = appConfig();

    const rateLimit = await this.rateLimiter.consume(
      LLM_FLASH_RPM_KEY,
      LLM_FLASH_RPM_LIMIT,
      LLM_RPM_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      return this.handleFlashLimit(options);
    }

    return this.generateWithRetry({
      model: cfg.gemini.chatModel,
      contents: options.prompt,
      promptVersion: options.promptVersion,
      userId: options.userId,
      maxTokens: options.maxTokens ?? 1000,
      temperature: options.temperature ?? 0.7,
      onRateLimit: options.onRateLimit ?? 'fallback',
      action: 'llm.complete',
    });
  }

  async embed(text: string): Promise<LLMEmbedResult> {
    if (this.shouldUseMockKeyFallback()) {
      return {
        vector: new Array(768).fill(0),
        latencyMs: 10,
      };
    }

    const cfg = appConfig();

    const rateLimit = await this.rateLimiter.consume(
      LLM_EMBED_RPM_KEY,
      LLM_EMBED_RPM_LIMIT,
      LLM_RPM_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      throw new EmbedQuotaExceededException();
    }

    const startedAt = Date.now();
    const response = await this.getClient().models.embedContent({
      model: cfg.gemini.embedModel,
      contents: text,
    });
    const vector = response.embeddings?.[0]?.values ?? [];

    if (vector.length !== 768) {
      throw new LLMProviderException(
        `Gemini embedding returned ${vector.length} dimensions; expected 768.`,
      );
    }

    const latencyMs = Date.now() - startedAt;
    this.logger.log({
      action: 'llm.embed',
      model: cfg.gemini.embedModel,
      latencyMs,
    });

    return { vector, latencyMs };
  }

  async *streamComplete(
    options: LLMCompleteOptions,
  ): AsyncGenerator<string, void, void> {
    if (this.shouldUseMockKeyFallback()) {
      const mockText = this.getMockResponse(options.prompt);
      const chunks = mockText.match(/.{1,3}/g) || [mockText];
      for (const chunk of chunks) {
        await this.sleep(40);
        yield chunk;
      }
      return;
    }

    const cfg = appConfig();

    const rateLimit = await this.rateLimiter.consume(
      LLM_FLASH_RPM_KEY,
      LLM_FLASH_RPM_LIMIT,
      LLM_RPM_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      if (options.onRateLimit === 'throw') {
        throw new LLMRateLimitedException();
      }
      this.logFallback('llm.stream_complete', options);
      yield LLM_FALLBACK_MESSAGE;
      return;
    }
    const startedAt = Date.now();
    const delays = [1000, 2000, 4000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      let yieldedChunks = 0;
      try {
        const stream = await this.getClient().models.generateContentStream({
          model: cfg.gemini.chatModel,
          contents: options.prompt,
          config: {
            maxOutputTokens: options.maxTokens ?? 1000,
            temperature: options.temperature ?? 0.7,
            safetySettings: this.safetySettings(),
          },
        });

        for await (const chunk of stream) {
          if (this.isSafetyBlocked(chunk)) {
            this.logSafetyBlock('llm.stream_complete', options);
            yield LLM_SAFETY_MESSAGE;
            return;
          }
          if (chunk.text) {
            yield chunk.text;
            yieldedChunks++;
          }
        }

        this.logger.log({
          action: 'llm.stream_complete',
          userId: options.userId,
          model: cfg.gemini.chatModel,
          promptVersion: options.promptVersion,
          latencyMs: Date.now() - startedAt,
          rateLimited: false,
        });
        return; // Success
      } catch (error) {
        if (error instanceof LLMConfigurationException) {
          throw error;
        }

        // If we already sent partial response to client, we cannot seamlessly retry
        if (yieldedChunks > 0) {
          throw new LLMProviderException(this.errorMessage(error));
        }

        lastError = error;
        if (!this.isRetryable(error) || attempt === delays.length) {
          break;
        }
        await this.sleep(delays[attempt]);
      }
    }

    if (options.onRateLimit !== 'throw') {
      this.logFallback('llm.stream_complete', options, lastError);
      yield LLM_FALLBACK_MESSAGE;
      return;
    }

    if (this.isRateLimitError(lastError)) {
      throw new LLMRateLimitedException();
    }
    throw new LLMProviderException(this.errorMessage(lastError));
  }

  async completeVision(
    options: VisionCompleteOptions,
  ): Promise<LLMCompleteResult> {
    if (this.shouldUseMockKeyFallback()) {
      return {
        text: this.getMockVisionResponse(),
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 50,
        rateLimited: false,
      };
    }

    const cfg = appConfig();

    const rateLimit = await this.rateLimiter.consume(
      LLM_FLASH_RPM_KEY,
      LLM_FLASH_RPM_LIMIT,
      LLM_RPM_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      return this.handleFlashLimit({
        promptVersion: options.promptVersion,
        userId: options.userId,
        onRateLimit: options.onRateLimit ?? 'throw',
      });
    }

    const contents: Content = {
      role: 'user',
      parts: [
        { text: options.prompt },
        {
          inlineData: {
            data: options.imageBuffer.toString('base64'),
            mimeType: options.mimeType,
          },
        },
      ],
    };

    return this.generateWithRetry({
      model: cfg.gemini.visionModel,
      contents,
      promptVersion: options.promptVersion,
      userId: options.userId,
      maxTokens: options.maxTokens ?? 1000,
      temperature: 0.2,
      // Vision là hành động tường minh của user (upload ảnh) → default 'throw'
      // khác với complete() dùng 'fallback' cho chat tự động.
      onRateLimit: options.onRateLimit ?? 'throw',
      action: 'llm.complete_vision',
    });
  }

  async *streamCompleteVision(
    options: VisionCompleteOptions,
  ): AsyncGenerator<string, void, void> {
    if (this.shouldUseMockKeyFallback()) {
      const mockText = this.getMockVisionResponse();
      const chunks = mockText.match(/.{1,3}/g) || [mockText];
      for (const chunk of chunks) {
        await this.sleep(40);
        yield chunk;
      }
      return;
    }

    const cfg = appConfig();
    const onRateLimit = options.onRateLimit ?? 'throw';

    const rateLimit = await this.rateLimiter.consume(
      LLM_FLASH_RPM_KEY,
      LLM_FLASH_RPM_LIMIT,
      LLM_RPM_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      if (onRateLimit === 'throw') {
        throw new LLMRateLimitedException();
      }
      this.logFallback('llm.stream_complete_vision', options);
      yield LLM_FALLBACK_MESSAGE;
      return;
    }

    const contents: Content = {
      role: 'user',
      parts: [
        { text: options.prompt },
        {
          inlineData: {
            data: options.imageBuffer.toString('base64'),
            mimeType: options.mimeType,
          },
        },
      ],
    };

    const startedAt = Date.now();
    const delays = [1000, 2000, 4000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      let yieldedChunks = 0;
      try {
        const stream = await this.getClient().models.generateContentStream({
          model: cfg.gemini.visionModel,
          contents,
          config: {
            maxOutputTokens: options.maxTokens ?? 1000,
            temperature: 0.2,
            safetySettings: this.safetySettings(),
          },
        });

        for await (const chunk of stream) {
          if (this.isSafetyBlocked(chunk)) {
            this.logSafetyBlock('llm.stream_complete_vision', options);
            yield LLM_SAFETY_MESSAGE;
            return;
          }
          if (chunk.text) {
            yield chunk.text;
            yieldedChunks++;
          }
        }

        this.logger.log({
          action: 'llm.stream_complete_vision',
          userId: options.userId,
          model: cfg.gemini.visionModel,
          promptVersion: options.promptVersion,
          latencyMs: Date.now() - startedAt,
          rateLimited: false,
        });
        return;
      } catch (error) {
        if (error instanceof LLMConfigurationException) {
          throw error;
        }

        if (yieldedChunks > 0) {
          throw new LLMProviderException(this.errorMessage(error));
        }

        lastError = error;
        if (!this.isRetryable(error) || attempt === delays.length) {
          break;
        }
        await this.sleep(delays[attempt]);
      }
    }

    if (onRateLimit !== 'throw') {
      this.logFallback('llm.stream_complete_vision', options, lastError);
      yield LLM_FALLBACK_MESSAGE;
      return;
    }

    if (this.isRateLimitError(lastError)) {
      throw new LLMRateLimitedException();
    }
    throw new LLMProviderException(this.errorMessage(lastError));
  }

  private async generateWithRetry(params: {
    model: string;
    contents: string | Content;
    promptVersion: string;
    userId?: string;
    maxTokens: number;
    temperature: number;
    onRateLimit: 'fallback' | 'throw';
    action: string;
  }): Promise<LLMCompleteResult> {
    const delays = [1000, 2000, 4000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await this.getClient().models.generateContent({
          model: params.model,
          contents: params.contents,
          config: {
            maxOutputTokens: params.maxTokens,
            temperature: params.temperature,
            safetySettings: this.safetySettings(),
          },
        });

        const latencyMs = Date.now() - startedAt;
        if (this.isSafetyBlocked(response)) {
          this.logSafetyBlock(params.action, params);
          return this.toCompleteResult(response, latencyMs, LLM_SAFETY_MESSAGE);
        }

        const result = this.toCompleteResult(response, latencyMs);
        this.logger.log({
          action: params.action,
          userId: params.userId,
          model: params.model,
          promptVersion: params.promptVersion,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          latencyMs: result.latencyMs,
          rateLimited: false,
        });
        return result;
      } catch (error) {
        if (error instanceof LLMConfigurationException) {
          throw error;
        }

        lastError = error;
        if (!this.isRetryable(error) || attempt === delays.length) {
          break;
        }
        await this.sleep(delays[attempt]);
      }
    }

    if (params.onRateLimit === 'fallback') {
      this.logFallback(params.action, params, lastError);
      return {
        text: LLM_FALLBACK_MESSAGE,
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        rateLimited: true,
      };
    }

    if (this.isRateLimitError(lastError)) {
      throw new LLMRateLimitedException();
    }
    throw new LLMProviderException(this.errorMessage(lastError));
  }

  private handleFlashLimit(
    options: Pick<
      LLMCompleteOptions,
      'onRateLimit' | 'promptVersion' | 'userId'
    >,
  ): LLMCompleteResult {
    if (options.onRateLimit === 'throw') {
      throw new LLMRateLimitedException();
    }

    this.logFallback('llm.rate_limited', options);
    return {
      text: LLM_FALLBACK_MESSAGE,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 0,
      rateLimited: true,
    };
  }

  private getMockResponse(prompt: string): string {
    const promptLower = prompt.toLowerCase();
    
    if (promptLower.includes('tưới') || promptLower.includes('nước')) {
      return 'Dạ bà con nhớ tưới nước đầy đủ cho ruộng lúa nha! Nước là nguồn sống chính giúp lúa đẻ nhánh khỏe và trổ bông đều đó ạ. 🌱💦';
    }
    if (promptLower.includes('phân') || promptLower.includes('bón')) {
      return 'Bón phân đợt 1 (7-10 ngày sau sạ) bà con nên dùng phân Ure kết hợp DAP để lúa bén rễ nhanh nhé! Bón đúng liều lượng nha bà con. 🌾';
    }
    if (promptLower.includes('sâu') || promptLower.includes('bệnh') || promptLower.includes('rầy')) {
      return 'Ôi, lúa nhà mình có dấu hiệu sâu bệnh hả bà con? Bà con kiểm tra kỹ lá và gốc lúa xem có rầy nâu hay đạo ôn không nhé. Chụp hình gửi Bé Thóc xem thử nha! 🐛🍂';
    }
    if (promptLower.includes('thời tiết') || promptLower.includes('nhiệt độ')) {
      return 'Dạ dạo này thời tiết thay đổi thất thường lắm, bà con nhớ theo dõi dự báo thời tiết để chủ động lượng nước tưới tiêu nhé! ☀️🌧️';
    }
    if (promptLower.includes('remind') || promptLower.includes('nhắc nhở') || promptLower.includes('lịch')) {
      return 'Bà con có thể nhấn vào nút Đặt nhắc nhở ở màn hình chính hoặc bảo em để em tạo lịch tưới nước, bón phân tự động nha! 📅⏰';
    }
    
    return 'Dạ Bé Thóc nghe rõ rồi ạ! Bà con nhớ chăm chỉ ghi nhật ký đồng ruộng hằng ngày để em theo dõi sức khỏe cây lúa nha. Chúc bà con một ngày tốt lành! 🌾💚';
  }

  private getMockVisionResponse(): string {
    return JSON.stringify({
      is_plant: true,
      disease_name: 'Chưa thể phân tích chính xác ảnh này',
      confidence: 0.1,
      symptoms: [
        'Hệ thống AI chẩn đoán đang ở chế độ thử nghiệm, kết quả này chưa phải phân tích bệnh thật.',
      ],
      treatment: {
        chemical: '',
        organic:
          'Vui lòng cấu hình AI chẩn đoán thật hoặc thử lại sau. Nếu lá tiếp tục khô/cháy lan rộng, hãy giữ riêng mẫu lá và hỏi chuyên gia nông nghiệp địa phương.',
      },
    });
  }

  private getClient(): GeminiClient {
    if (this.client) {
      return this.client;
    }

    const cfg = appConfig();
    if (!cfg.gemini.apiKey) {
      throw new LLMConfigurationException();
    }

    this.client = new GoogleGenAI({ apiKey: cfg.gemini.apiKey });
    return this.client;
  }

  private safetySettings() {
    return [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
      },
    ];
  }

  private toCompleteResult(
    response: GenerateContentResponse,
    latencyMs: number,
    overrideText?: string,
  ): LLMCompleteResult {
    return {
      text: overrideText ?? response.text ?? '',
      promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
      latencyMs,
      rateLimited: false,
    };
  }

  private isSafetyBlocked(response: GenerateContentResponse): boolean {
    return (
      (response.candidates?.some(
        (candidate) => candidate.finishReason === 'SAFETY',
      ) ??
        false) ||
      Boolean(response.promptFeedback?.blockReason)
    );
  }

  private isRetryable(error: unknown): boolean {
    if (this.isRateLimitError(error)) {
      return true;
    }

    const status = this.errorStatus(error);
    if (status && status >= 500) {
      return true;
    }

    const code = this.errorCode(error);
    return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(code);
  }

  private isRateLimitError(error: unknown): boolean {
    return this.errorStatus(error) === 429;
  }

  private errorStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const record = error as Record<string, unknown>;
    const status = record.status ?? record.statusCode ?? record.code;
    return typeof status === 'number' ? status : undefined;
  }

  private errorCode(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return '';
    }
    const code = (error as Record<string, unknown>).code;
    return typeof code === 'string' ? code : '';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'Gemini provider request failed.';
  }

  private logFallback(
    action: string,
    options: Pick<LLMCompleteOptions, 'promptVersion' | 'userId'>,
    error?: unknown,
  ): void {
    this.logger.warn({
      action,
      userId: options.userId,
      promptVersion: options.promptVersion,
      rateLimited: true,
      error: error ? this.errorMessage(error) : undefined,
    });
  }

  private logSafetyBlock(
    action: string,
    options: Pick<LLMCompleteOptions, 'promptVersion' | 'userId'>,
  ): void {
    this.logger.warn({
      action: 'llm.safety_block',
      sourceAction: action,
      userId: options.userId,
      promptVersion: options.promptVersion,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
