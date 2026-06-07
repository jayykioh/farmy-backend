import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import * as Sentry from '@sentry/nestjs';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'Lỗi hệ thống!';

    if (exception instanceof Error) {
      message = exception.message;
    }

    if (exception instanceof HttpException) {
      const resContent = exception.getResponse();
      if (typeof resContent === 'object' && resContent !== null) {
        const record = resContent as Record<string, unknown>;

        if (typeof record.errorCode === 'string') {
          errorCode = record.errorCode;
        } else if (typeof record.error === 'string') {
          errorCode = record.error;
        } else {
          errorCode = 'BAD_REQUEST';
        }

        if (record.message) {
          if (Array.isArray(record.message)) {
            message = record.message.join(', ');
          } else if (typeof record.message === 'string') {
            message = record.message;
          }
        }
      } else if (typeof resContent === 'string') {
        message = resContent;
        errorCode = HttpStatus[status] || 'BAD_REQUEST';
      }
    }

    if (status === 401 && errorCode === 'BAD_REQUEST') {
      errorCode = 'AUTH_INVALID_TOKEN';
    }

    // Log the error and report to Sentry if it's a server error (5xx)
    if (status >= 500) {
      this.logger.error(
        `Unhandled server error: ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      Sentry.captureException(exception);
    } else {
      this.logger.warn(`Client error [${status}]: ${message}`);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
