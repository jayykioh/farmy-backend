import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { TokenPayload } from '../../application/services/token-service.interface';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { IUserRepositoryToken } from '../../domain/repositories/user-repository.interface';
import { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { createAuthError } from '../../../../common/auth/auth-errors';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer: 'farmdiaries-backend',
      audience: 'farmdiaries-pwa',
      secretOrKey: configService.get<string>(
        'JWT_SECRET',
        'access-secret-key-123456',
      ),
    });
  }

  async validate(payload: TokenPayload): Promise<AuthenticatedUser> {
    const user = await this.userRepository.findById(payload.sub);

    if (!user) {
      throw createAuthError(
        'AUTH_INVALID_SESSION',
        'Người dùng không tồn tại hoặc token không hợp lệ!',
      );
    }

    return {
      id: payload.sub,
      email: user.getEmail(),
      role: user.getRole(),
      name: user.getName(),
    };
  }
}
