import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { IapService } from './iap.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, IapService, PrismaService],
  exports: [SubscriptionService, IapService],
})
export class SubscriptionModule {}
