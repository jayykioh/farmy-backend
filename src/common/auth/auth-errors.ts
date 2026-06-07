import {
  ConflictException,
  ForbiddenException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';

export const AUTH_ERROR_MATRIX = {
  AUTH_MISSING_ACCESS_TOKEN: {
    statusCode: 401,
    message: 'Không đính kèm Bearer token ở header!',
  },
  AUTH_TOKEN_EXPIRED: {
    statusCode: 401,
    message: 'Access Token đã hết hạn!',
  },
  AUTH_INVALID_TOKEN: {
    statusCode: 401,
    message: 'Token bị sai chữ ký hoặc sai cấu trúc!',
  },
  AUTH_INVALID_CREDENTIALS: {
    statusCode: 401,
    message: 'Email hoặc mật khẩu không chính xác!',
  },
  AUTH_EMAIL_EXISTS: {
    statusCode: 409,
    message: 'Email đã tồn tại trong hệ thống!',
  },
  AUTH_MISSING_REFRESH_TOKEN: {
    statusCode: 401,
    message: 'Không tìm thấy Refresh Token!',
  },
  AUTH_REFRESH_FAILED: {
    statusCode: 401,
    message: 'Refresh Token không hợp lệ hoặc đã hết hạn!',
  },
  AUTH_TOKEN_REUSED: {
    statusCode: 401,
    message: 'Refresh Token đã được sử dụng trước đó!',
  },
  AUTH_UNAUTHENTICATED: {
    statusCode: 401,
    message: 'Bạn cần đăng nhập để thực hiện thao tác này!',
  },
  AUTH_FORBIDDEN: {
    statusCode: 403,
    message: 'Bạn không có quyền truy cập tài nguyên này!',
  },
  AUTH_INVALID_SESSION: {
    statusCode: 401,
    message: 'Người dùng không tồn tại hoặc phiên đăng nhập không hợp lệ!',
  },
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERROR_MATRIX;

export interface AuthErrorResponse {
  errorCode: AuthErrorCode;
  message: string;
}

export function createAuthError(
  errorCode: AuthErrorCode,
  message?: string,
): HttpException {
  const entry = AUTH_ERROR_MATRIX[errorCode];
  const response: AuthErrorResponse = {
    errorCode,
    message: message ?? entry.message,
  };

  if (entry.statusCode === 403) {
    return new ForbiddenException(response);
  }

  if (entry.statusCode === 409) {
    return new ConflictException(response);
  }

  return new UnauthorizedException(response);
}
