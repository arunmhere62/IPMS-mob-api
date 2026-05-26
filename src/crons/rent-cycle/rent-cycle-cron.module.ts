import { Module } from '@nestjs/common';
import { CommonModule } from '../../modules/common/common.module';
import { RentCycleCronController } from './rent-cycle-cron.controller';
import { RentCycleCronService } from './rent-cycle-cron.service';

@Module({
  imports: [CommonModule],
  providers: [RentCycleCronService],
  controllers: [RentCycleCronController],
})
export class RentCycleCronModule {}
