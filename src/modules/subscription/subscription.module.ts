import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRestrictionService } from './subscription-restriction.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionRestrictionService, PrismaService],
  exports: [SubscriptionService, SubscriptionRestrictionService],
})
export class SubscriptionModule {}
