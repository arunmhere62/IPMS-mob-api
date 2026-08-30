import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnerPaymentConfigController } from './owner-payment-config.controller';
import { OwnerPaymentConfigService } from './owner-payment-config.service';

@Module({
  controllers: [OwnerPaymentConfigController],
  providers: [OwnerPaymentConfigService, PrismaService],
  exports: [OwnerPaymentConfigService],
})
export class OwnerPaymentConfigModule {}
