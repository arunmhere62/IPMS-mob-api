import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../../prisma/prisma.module';
import { AuthModule } from '../../../auth/auth.module';
import { NotificationModule } from '../../../notification/notification.module';
import { PendingPaymentService } from '../pending-payment.service';
import { TenantStatusService } from '../../tenant-status/tenant-status.service';
import { PendingPaymentCronController } from './pending-payment-cron.controller';
import { PendingPaymentCronService } from './pending-payment-cron.service';

@Module({
  imports: [PrismaModule, AuthModule, NotificationModule],
  controllers: [PendingPaymentCronController],
  providers: [PendingPaymentCronService, PendingPaymentService, TenantStatusService],
  exports: [PendingPaymentCronService],
})
export class PendingPaymentCronModule {}
