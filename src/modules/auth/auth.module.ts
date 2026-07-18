import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { AuthController } from './interface/controllers/auth.controller';
import { UserController } from './interface/controllers/user.controller';
import { RegisterUserHandler } from './application/commands/register-user.handler';
import { LoginUserHandler } from './application/commands/login-user.handler';
import { RefreshTokenHandler } from './application/commands/refresh-token.handler';
import { LogoutHandler } from './application/commands/logout.handler';
import { GoogleLoginHandler } from './application/commands/google-login.handler';
import { GoogleStrategy } from './infrastructure/strategies/google.strategy';
import { IUserRepositoryToken } from './domain/repositories/user-repository.interface';
import { MongooseUserRepository } from './infrastructure/persistence/mongoose-user.repository';
import {
  UserDocument,
  UserSchema,
} from './infrastructure/persistence/user.schema';
import {
  RefreshTokenDocument,
  RefreshTokenSchema,
} from './infrastructure/persistence/refresh-token.schema';
import {
  UserConsentDocument,
  UserConsentSchema,
} from './infrastructure/persistence/user-consent.schema';
import {
  FarmPlotDocument,
  FarmPlotSchema,
} from '../farm/infrastructure/persistence/farm-plot.schema';
import {
  DiaryDocument,
  DiarySchema,
} from '../farm/infrastructure/persistence/diary.schema';
import {
  DiaryLogDocument,
  DiaryLogSchema,
} from '../farm/infrastructure/persistence/diary-log.schema';
import {
  ReminderDocument,
  ReminderSchema,
} from '../farm/infrastructure/persistence/reminder.schema';
import {
  PetStateDocument,
  PetStateSchema,
} from '../pet/infrastructure/persistence/pet-state.schema';
import {
  AiChatDocument,
  AiChatSchema,
} from '../ai/infrastructure/persistence/ai-chat.schema';
import {
  AiChatMemoryDocument,
  AiChatMemorySchema,
} from '../ai/infrastructure/persistence/ai-chat-memory.schema';
import {
  AiFeedbackDocument,
  AiFeedbackSchema,
} from '../ai/infrastructure/persistence/ai-feedback.schema';
import {
  PlantScanDocument,
  PlantScanSchema,
} from '../plant-scan/infrastructure/persistence/plant-scan.schema';
import { ITokenServiceToken } from './application/services/token-service.interface';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { IRefreshTokenRepositoryToken } from './domain/repositories/refresh-token-repository.interface';
import { MongooseRefreshTokenRepository } from './infrastructure/persistence/mongoose-refresh-token.repository';
import { PrivacyProcessor } from './infrastructure/queue/privacy.processor';
import { StorageModule } from '../storage/storage.module';
import { EmailService } from './application/services/email.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';

const CommandHandlers = [
  RegisterUserHandler,
  LoginUserHandler,
  RefreshTokenHandler,
  LogoutHandler,
  GoogleLoginHandler,
];

@Module({
  imports: [
    CqrsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: UserDocument.name, schema: UserSchema },
      { name: RefreshTokenDocument.name, schema: RefreshTokenSchema },
      { name: UserConsentDocument.name, schema: UserConsentSchema },
      { name: FarmPlotDocument.name, schema: FarmPlotSchema },
      { name: DiaryDocument.name, schema: DiarySchema },
      { name: DiaryLogDocument.name, schema: DiaryLogSchema },
      { name: ReminderDocument.name, schema: ReminderSchema },
      { name: PetStateDocument.name, schema: PetStateSchema },
      { name: AiChatDocument.name, schema: AiChatSchema },
      { name: AiChatMemoryDocument.name, schema: AiChatMemorySchema },
      { name: AiFeedbackDocument.name, schema: AiFeedbackSchema },
      { name: PlantScanDocument.name, schema: PlantScanSchema },
    ]),
    BullModule.registerQueue({
      name: 'privacy',
    }),
    StorageModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('SMTP_HOST'),
          port: configService.get<number>('SMTP_PORT'),
          secure: configService.get<number>('SMTP_PORT') == 465, // true for 465, false for other ports
          auth: {
            user: configService.get<string>('SMTP_USER'),
            pass: configService.get<string>('SMTP_PASS'),
          },
        },
        defaults: {
          from: `"Farmy" <${configService.get<string>('SMTP_USER')}>`,
        },
      }),
    }),
  ],
  controllers: [AuthController, UserController],
  providers: [
    ...CommandHandlers,
    JwtStrategy,
    GoogleStrategy,
    PrivacyProcessor,
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
    EmailService,
  ],
  exports: [
    IUserRepositoryToken,
    ITokenServiceToken,
    IRefreshTokenRepositoryToken,
    PassportModule,
    JwtStrategy,
    EmailService,
  ],
})
export class AuthModule {}
