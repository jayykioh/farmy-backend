import {
  HttpException,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';

export class LLMRateLimitedException extends HttpException {
  constructor(message = 'Gemini quota is temporarily exhausted.') {
    super(
      {
        errorCode: 'LLM_RATE_LIMITED',
        message,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class EmbedQuotaExceededException extends HttpException {
  constructor(message = 'Embedding quota is temporarily exhausted.') {
    super(
      {
        errorCode: 'EMBED_QUOTA_EXCEEDED',
        message,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class LLMConfigurationException extends InternalServerErrorException {
  constructor(message = 'Gemini API key is not configured.') {
    super({
      errorCode: 'LLM_CONFIGURATION_MISSING',
      message,
    });
  }
}

export class LLMProviderException extends InternalServerErrorException {
  constructor(message = 'Gemini provider request failed.') {
    super({
      errorCode: 'LLM_ERROR',
      message,
    });
  }
}
