import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthDbService } from './auth-db.service';
import { SmsService } from './sms.service';
import { JwtTokenService } from './jwt.service';
import { OtpStrategyFactory } from './strategies/otp-strategy.factory';
import { ProductionOtpStrategy } from './strategies/production-otp.strategy';
import { DevelopmentOtpStrategy } from './strategies/development-otp.strategy';
import { S3DeletionService } from '../common/s3-deletion.service';
import { S3Module } from '../../s3/s3.module';
import { OtpController } from './controllers/otp.controller';
import { TokensController } from './controllers/tokens.controller';
import { SignupController } from './controllers/signup.controller';
import { ProfileController } from './controllers/profile.controller';
import { UsersController } from './controllers/users.controller';

@Module({
  imports: [
    S3Module,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('app.auth.jwtAccessTokenExpiry', '24h') as any,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OtpController, TokensController, SignupController, ProfileController, UsersController],
  providers: [
    AuthDbService,
    SmsService,
    JwtTokenService,
    OtpStrategyFactory,
    ProductionOtpStrategy,
    DevelopmentOtpStrategy,
    S3DeletionService,
  ],
  exports: [AuthDbService, SmsService, JwtTokenService, OtpStrategyFactory],
})
export class AuthModule {}
