import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantTicketsService } from './tenant-tickets.service';
import { TenantTicketsController } from './tenant-tickets.controller';
import { PgTicketsController } from './pg-tickets.controller';
import { TicketsGateway } from './gateway/tickets.gateway';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { NotificationService } from '../notification/notification.service';
import type { JwtSignOptions } from '@nestjs/jwt';

@Module({
  imports: [
    AuthModule,
    NotificationModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('app.auth.jwtAccessTokenExpiry', '24h') as unknown as JwtSignOptions['expiresIn'],
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [TenantTicketsController, PgTicketsController],
  providers: [
    PrismaService,
    {
      provide: TenantTicketsService,
      useFactory: (prisma: PrismaService, gateway: TicketsGateway, notificationService: NotificationService) =>
        new TenantTicketsService(prisma, gateway, notificationService),
      inject: [PrismaService, TicketsGateway, NotificationService],
    },
    TicketsGateway,
  ],
})
export class TenantTicketsModule {}
