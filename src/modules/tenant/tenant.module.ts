import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { CheckoutModule } from './checkout/checkout.module';
import { TenantPaymentModule } from './tenant-payment/rent-payment.module';
import { AdvancePaymentModule } from './advance-payment/advance-payment.module';
import { RefundPaymentModule } from './refund-payment/refund-payment.module';
import { CurrentBillModule } from './current-bill/current-bill.module';
import { PendingPaymentModule } from './pending-payment/pending-payment.module';
import { TenantStatusModule } from './tenant-status/tenant-status.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuthModule } from '../auth/auth.module';
import { TenantRentSummaryService } from './tenant-rent-summary.service';

@Module({
  imports: [PrismaModule, CommonModule, SubscriptionModule, AuthModule, CheckoutModule, TenantPaymentModule, AdvancePaymentModule, RefundPaymentModule, CurrentBillModule, PendingPaymentModule, TenantStatusModule],
  controllers: [TenantController],
  providers: [TenantService, TenantRentSummaryService],
  exports: [TenantService],
})
export class TenantModule {}
