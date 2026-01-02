import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TenantRentSummaryService } from '../tenant-rent-summary.service';

@Module({
  imports: [PrismaModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, TenantRentSummaryService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
