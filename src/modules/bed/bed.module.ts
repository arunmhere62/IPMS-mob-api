import { Module } from '@nestjs/common';
import { BedService } from './bed.service';
import { BedController } from './bed.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { SubscriptionModule } from '../subscription/subscription.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, CommonModule, SubscriptionModule, AuthModule],
  controllers: [BedController],
  providers: [BedService],
  exports: [BedService],
})
export class BedModule {}
