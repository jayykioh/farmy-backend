import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LogoutCommand } from './logout.command';
import { Inject } from '@nestjs/common';
import type { IRefreshTokenRepository } from '../../domain/repositories/refresh-token-repository.interface';
import { IRefreshTokenRepositoryToken } from '../../domain/repositories/refresh-token-repository.interface';
import type { ITokenService } from '../services/token-service.interface';
import { ITokenServiceToken } from '../services/token-service.interface';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(
    @Inject(IRefreshTokenRepositoryToken)
    private readonly refreshTokenRepository: IRefreshTokenRepository,
    @Inject(ITokenServiceToken)
    private readonly tokenService: ITokenService,
  ) {}

  async execute(command: LogoutCommand): Promise<void> {
    const { refreshToken } = command;

    if (!refreshToken) {
      return;
    }

    try {
      // Try to find by token string in DB
      const tokenDoc =
        await this.refreshTokenRepository.findByToken(refreshToken);
      if (tokenDoc) {
        // Invalidate the entire family upon logout
        await this.refreshTokenRepository.revokeFamily(tokenDoc.getFamilyId());
      }
    } catch {
      // Ignore errors to ensure logout is resilient and idempotent
    }
  }
}
