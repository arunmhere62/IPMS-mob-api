import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { PgLocationController } from './pg-location.controller';
import { PgLocationService } from './pg-location.service';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [PrismaModule, CommonModule, SubscriptionModule],
  controllers: [PgLocationController],
  providers: [PgLocationService],
  exports: [PgLocationService],
})
export class PgLocationModule {}
