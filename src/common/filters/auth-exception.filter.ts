import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
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

        if (typeof record.error_code === 'string') {
          errorCode = record.error_code;
        } else if (typeof record.errorCode === 'string') {
          // Accept legacy/internal camelCase exception payloads at the boundary.
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
      }
    }

    if (status === 401 && errorCode === 'BAD_REQUEST') {
      errorCode = 'AUTH_INVALID_TOKEN';
    }

    response.status(status).json({
      success: false,
      status_code: status,
      error_code: errorCode,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
