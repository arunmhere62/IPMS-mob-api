import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';
import { PendingPaymentController } from './pending-payment.controller';
import { PendingPaymentService } from './pending-payment.service';
import { TenantStatusService } from '../tenant-status/tenant-status.service';
import { AuthModule } from '../../auth/auth.module';
import { NotificationModule } from '../../notification/notification.module';

@Module({
  imports: [PrismaModule, CommonModule, AuthModule, NotificationModule],
  controllers: [PendingPaymentController],
  providers: [PendingPaymentService, TenantStatusService],
  exports: [PendingPaymentService],
})
export class PendingPaymentModule {}
