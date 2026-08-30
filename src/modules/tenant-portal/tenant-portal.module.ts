import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { TenantModule } from '../tenant/tenant.module';
import { NotificationModule } from '../notification/notification.module';
import { TenantPortalController } from './tenant-portal.controller';
import { TenantAuthController } from './auth/tenant-auth.controller';
import { PrismaService } from '@/prisma/prisma.service';
import { TenantAuthService } from './auth/tenant-auth.service';
import { TenantPortalService } from './tenant-portal.service';
import { TenantPaymentService } from './tenant-payment.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    forwardRef(() => ActivityLogsModule),
    TenantModule,
    NotificationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: '7d',
        },
      }),
    }),
  ],
  controllers: [TenantPortalController, TenantAuthController],
  providers: [TenantPortalService, TenantAuthService, TenantPaymentService, PrismaService],
  exports: [TenantPortalService, TenantPaymentService],
})
export class TenantPortalModule {}
