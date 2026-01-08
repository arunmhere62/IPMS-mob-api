import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationModule } from '../../modules/notification/notification.module';
import { PendingPaymentService } from '../../modules/tenant/pending-payment/pending-payment.service';
import { TenantStatusService } from '../../modules/tenant/tenant-status/tenant-status.service';
import { PendingPaymentCronController } from './pending-payment-cron.controller';
import { PendingPaymentCronService } from './pending-payment-cron.service';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [PendingPaymentCronController],
  providers: [PendingPaymentCronService, PendingPaymentService, TenantStatusService],
  exports: [PendingPaymentCronService],
})
export class PendingPaymentCronModule {}
