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

  async complete(options: LLMCompleteOptions): Promise<LLMCompleteResult> {
    const rateLimit = await this.rateLimiter.consume(
      LLM_FLASH_RPM_KEY,
      LLM_FLASH_RPM_LIMIT,
      LLM_RPM_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      return this.handleFlashLimit(options);
    }

    const cfg = appConfig();
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
    const rateLimit = await this.rateLimiter.consume(
      LLM_EMBED_RPM_KEY,
      LLM_EMBED_RPM_LIMIT,
      LLM_RPM_WINDOW_SECONDS,
    );

    if (!rateLimit.allowed) {
      throw new EmbedQuotaExceededException();
    }

    const startedAt = Date.now();
    const cfg = appConfig();
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

    const cfg = appConfig();
    const startedAt = Date.now();
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
  }

  async completeVision(
    options: VisionCompleteOptions,
  ): Promise<LLMCompleteResult> {
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

    const cfg = appConfig();
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
      response.candidates?.some((candidate) => candidate.finishReason === 'SAFETY') ??
      false
    ) || Boolean(response.promptFeedback?.blockReason);
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
    return error instanceof Error ? error.message : 'Gemini provider request failed.';
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
