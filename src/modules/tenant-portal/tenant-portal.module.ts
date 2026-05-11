import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { TenantPortalController } from './tenant-portal.controller';
import { TenantAuthController } from './auth/tenant-auth.controller';
import { PrismaService } from '@/prisma/prisma.service';
import { TenantAuthService } from './auth/tenant-auth.service';
import { TenantPortalService } from './tenant-portal.service';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    TenantModule,
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
  providers: [TenantPortalService, TenantAuthService, PrismaService],
  exports: [TenantPortalService],
})
export class TenantPortalModule {}
