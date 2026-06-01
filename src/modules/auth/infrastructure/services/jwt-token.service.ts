import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ITokenService,
  TokenPayload,
  RefreshTokenDecoded,
} from '../../application/services/token-service.interface';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class JwtTokenService implements ITokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: TokenPayload): string {
    const secret = this.configService.get<string>(
      'JWT_SECRET',
      'access-secret-key-123456',
    );
    return this.jwtService.sign(
      {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        name: payload.name,
        iss: 'farmdiaries-backend',
        aud: 'farmdiaries-pwa',
      },
      {
        secret,
        expiresIn: '15m',
      },
    );
  }

  generateRefreshToken(payload: TokenPayload): string {
    const secret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'refresh-secret-key-123456',
    );
    return this.jwtService.sign(
      {
        sub: payload.sub,
        jti: payload.jti || crypto.randomUUID(),
        iss: 'farmdiaries-backend',
      },
      {
        secret,
        expiresIn: '30d',
      },
    );
  }

  verifyRefreshToken(token: string): RefreshTokenDecoded {
    const secret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'refresh-secret-key-123456',
    );
    return this.jwtService.verify<RefreshTokenDecoded>(token, { secret });
  }
}
