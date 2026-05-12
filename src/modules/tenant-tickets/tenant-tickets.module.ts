import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantTicketsService } from './tenant-tickets.service';
import { TenantTicketsController } from './tenant-tickets.controller';
import { PgTicketsController } from './pg-tickets.controller';
import { TicketsGateway } from './gateway/tickets.gateway';
import { AuthModule } from '../auth/auth.module';
import type { JwtSignOptions } from '@nestjs/jwt';

@Module({
  imports: [
    AuthModule,
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
      useFactory: (prisma: PrismaService, gateway: TicketsGateway) =>
        new TenantTicketsService(prisma, gateway),
      inject: [PrismaService, TicketsGateway],
    },
    TicketsGateway,
  ],
})
export class TenantTicketsModule {}
