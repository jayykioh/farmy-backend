import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './interface/controllers/auth.controller';
import { RegisterUserHandler } from './application/commands/register-user.handler';
import { LoginUserHandler } from './application/commands/login-user.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { LogoutHandler } from './application/commands/logout.handler';
import { IUserRepositoryToken } from './domain/repositories/user-repository.interface';
import { MongooseUserRepository } from './infrastructure/persistence/mongoose-user.repository';
import {
  UserDocument,
  UserSchema,
} from './infrastructure/persistence/user.schema';
import { ITokenServiceToken } from './application/services/token-service.interface';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { IRefreshTokenRepositoryToken } from './domain/repositories/refresh-token-repository.interface';
import { MongooseRefreshTokenRepository } from './infrastructure/persistence/mongoose-refresh-token.repository';
import {
  RefreshTokenDocument,
  RefreshTokenSchema,
} from './infrastructure/persistence/refresh-token.schema';

const CommandHandlers = [
  RegisterUserHandler,
  LoginUserHandler,
  RefreshTokenHandler,
  LogoutHandler,
];

@Module({
  imports: [
    CqrsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: UserDocument.name, schema: UserSchema },
      { name: RefreshTokenDocument.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    ...CommandHandlers,
    JwtStrategy,
    {
      provide: IUserRepositoryToken,
      useClass: MongooseUserRepository,
    },
    {
      provide: ITokenServiceToken,
      useClass: JwtTokenService,
    },
    {
      provide: IRefreshTokenRepositoryToken,
      useClass: MongooseRefreshTokenRepository,
    },
  ],
  exports: [
    IUserRepositoryToken,
    ITokenServiceToken,
    IRefreshTokenRepositoryToken,
    PassportModule,
    JwtStrategy,
  ],
})
export class AuthModule {}
