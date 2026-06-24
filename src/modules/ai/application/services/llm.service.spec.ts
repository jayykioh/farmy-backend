/* eslint-disable no-var */
import { LLMService } from './llm.service';
import {
  EmbedQuotaExceededException,
  LLMConfigurationException,
  LLMProviderException,
  LLMRateLimitedException,
} from '../../domain/llm.errors';
import {
  LLM_FALLBACK_MESSAGE,
  LLM_SAFETY_MESSAGE,
} from '../../domain/llm.constants';

var mockGenerateContent: jest.Mock;
var mockGenerateContentStream: jest.Mock;
var mockEmbedContent: jest.Mock;
var mockGoogleGenAI: jest.Mock;

jest.mock('@google/genai', () => {
  mockGenerateContent = jest.fn();
  mockGenerateContentStream = jest.fn();
  mockEmbedContent = jest.fn();
  mockGoogleGenAI = jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
      embedContent: mockEmbedContent,
    },
  }));

  return {
    GoogleGenAI: mockGoogleGenAI,
    HarmBlockThreshold: {
      BLOCK_LOW_AND_ABOVE: 'BLOCK_LOW_AND_ABOVE',
      BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    HarmCategory: {
      HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
      HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
      HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    },
  };
});

describe('LLMService', () => {
  const rateLimiter = {
    consume: jest.fn(),
  };

  let service: LLMService;
  let sleepSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_CHAT_MODEL = 'gemini-1.5-flash';
    process.env.GEMINI_VISION_MODEL = 'gemini-1.5-flash';
    process.env.GEMINI_EMBED_MODEL = 'text-embedding-004';
    service = new LLMService(rateLimiter as never);
    sleepSpy = jest
      .spyOn(
        service as unknown as { sleep: (ms: number) => Promise<void> },
        'sleep',
      )
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_CHAT_MODEL;
    delete process.env.GEMINI_VISION_MODEL;
    delete process.env.GEMINI_EMBED_MODEL;
  });

  it('returns fallback when Flash RPM is denied by default', async () => {
    rateLimiter.consume.mockResolvedValue({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
    });

    await expect(
      service.complete({ prompt: 'hello', promptVersion: 'v1.0' }),
    ).resolves.toEqual({
      text: LLM_FALLBACK_MESSAGE,
      promptTokens: 0,
      completionTokens: 0,
      latencyMs: 0,
      rateLimited: true,
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('throws when Flash RPM is denied and onRateLimit is throw', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: false });

    await expect(
      service.complete({
        prompt: 'hello',
        promptVersion: 'v1.0',
        onRateLimit: 'throw',
      }),
    ).rejects.toBeInstanceOf(LLMRateLimitedException);
  });

  it('calls Gemini and returns token metadata on success', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: true });
    mockGenerateContent.mockResolvedValue({
      text: 'answer',
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 7,
      },
    });

    await expect(
      service.complete({ prompt: 'hello', promptVersion: 'v1.0' }),
    ).resolves.toMatchObject({
      text: 'answer',
      promptTokens: 5,
      completionTokens: 7,
      rateLimited: false,
    });

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-1.5-flash',
        contents: 'hello',
      }),
    );
  });

  it('retries Gemini 429s then returns fallback for fallback mode', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: true });
    mockGenerateContent.mockRejectedValue({ status: 429 });

    await expect(
      service.complete({ prompt: 'hello', promptVersion: 'v1.0' }),
    ).resolves.toMatchObject({
      text: LLM_FALLBACK_MESSAGE,
      rateLimited: true,
    });

    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 1000);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 2000);
    expect(sleepSpy).toHaveBeenNthCalledWith(3, 4000);
  });

  it('throws provider errors after retries in throw mode for non-429 failures', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: true });
    mockGenerateContent.mockRejectedValue({
      status: 503,
      message: 'unavailable',
    });

    await expect(
      service.complete({
        prompt: 'hello',
        promptVersion: 'v1.0',
        onRateLimit: 'throw',
      }),
    ).rejects.toBeInstanceOf(LLMProviderException);
    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
  });

  it('returns the safety message when Gemini blocks content', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: true });
    mockGenerateContent.mockResolvedValue({
      text: '',
      candidates: [{ finishReason: 'SAFETY' }],
      usageMetadata: {
        promptTokenCount: 3,
        candidatesTokenCount: 0,
      },
    });

    await expect(
      service.complete({ prompt: 'bad', promptVersion: 'v1.0' }),
    ).resolves.toMatchObject({
      text: LLM_SAFETY_MESSAGE,
      promptTokens: 3,
      completionTokens: 0,
      rateLimited: false,
    });
  });

  it('throws when GEMINI_API_KEY is missing on call', async () => {
    delete process.env.GEMINI_API_KEY;
    rateLimiter.consume.mockResolvedValue({ allowed: true });

    await expect(
      service.complete({ prompt: 'hello', promptVersion: 'v1.0' }),
    ).rejects.toBeInstanceOf(LLMConfigurationException);
  });

  it('throws EmbedQuotaExceededException when embed RPM is denied', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: false });

    await expect(service.embed('text')).rejects.toBeInstanceOf(
      EmbedQuotaExceededException,
    );
  });

  it('returns a 768 dimension embedding vector', async () => {
    rateLimiter.consume.mockResolvedValue({ allowed: true });
    const vector = Array.from({ length: 768 }, (_, index) => index / 768);
    mockEmbedContent.mockResolvedValue({
      embeddings: [{ values: vector }],
    });

    await expect(service.embed('text')).resolves.toMatchObject({
      vector,
    });
  });
});
