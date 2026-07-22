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

    // ── Multer file-size error → 413 ────────────────────────────────────────
    // multer throws a plain Error (not HttpException) with code LIMIT_FILE_SIZE
    // when the uploaded file exceeds the limits.fileSize option.
    const multerCode = (exception as any)?.code;
    if (multerCode === 'LIMIT_FILE_SIZE') {
      return response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        success: false,
        status_code: HttpStatus.PAYLOAD_TOO_LARGE,
        error_code: 'FILE_TOO_LARGE',
        message:
          'File tải lên vượt quá giới hạn cho phép (tối đa 10MB). Vui lòng nén file hoặc chia nhỏ nội dung.',
        timestamp: new Date().toISOString(),
      });
    }

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
