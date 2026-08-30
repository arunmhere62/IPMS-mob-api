import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentVerificationController } from './payment-verification.controller';
import { PaymentVerificationService } from './payment-verification.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [PaymentVerificationController],
  providers: [PaymentVerificationService, PrismaService],
  exports: [PaymentVerificationService],
})
export class PaymentVerificationModule {}
