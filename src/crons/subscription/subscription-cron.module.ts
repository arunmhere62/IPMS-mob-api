import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SubscriptionExpiryCronService } from './subscription-expiry-cron.service';

@Module({
  imports: [PrismaModule],
  providers: [SubscriptionExpiryCronService],
  exports: [SubscriptionExpiryCronService],
})
export class SubscriptionCronModule {}
