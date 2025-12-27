import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentGatewayService } from './payment-gateway.service';
import { CCavenueService } from './ccavenue.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
  controllers: [PaymentGatewayController],
  providers: [PaymentGatewayService, CCavenueService],
  exports: [PaymentGatewayService, CCavenueService],
})
export class PaymentGatewayModule {}
