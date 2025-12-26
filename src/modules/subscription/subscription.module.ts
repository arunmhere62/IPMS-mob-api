import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRestrictionService } from './subscription-restriction.service';

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionRestrictionService, PrismaService],
  exports: [SubscriptionService, SubscriptionRestrictionService],
})
export class SubscriptionModule {}
