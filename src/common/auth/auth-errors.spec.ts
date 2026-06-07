import {
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AUTH_ERROR_MATRIX, createAuthError } from './auth-errors';

describe('auth-errors', () => {
  it('defines the standard auth matrix with stable responses', () => {
    expect(AUTH_ERROR_MATRIX.AUTH_MISSING_ACCESS_TOKEN).toEqual({
      statusCode: 401,
      message: 'Không đính kèm Bearer token ở header!',
    });
    expect(AUTH_ERROR_MATRIX.AUTH_FORBIDDEN).toEqual({
      statusCode: 403,
      message: 'Bạn không có quyền truy cập tài nguyên này!',
    });
  });

  it('builds the right exception type for 401 codes', () => {
    expect(createAuthError('AUTH_INVALID_TOKEN')).toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('builds the right exception type for 403 codes', () => {
    expect(createAuthError('AUTH_FORBIDDEN')).toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('builds the right exception type for 409 codes', () => {
    expect(createAuthError('AUTH_EMAIL_EXISTS')).toBeInstanceOf(
      ConflictException,
    );
  });
});
