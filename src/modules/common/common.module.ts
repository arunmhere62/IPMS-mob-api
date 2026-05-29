import { Module } from '@nestjs/common';
import { S3Module } from '../../s3/s3.module';
import { RentCycleCalculatorService } from './rent-cycle-calculator.service';
import { RentCycleCreationService } from './rent-cycle-creation.service';
import { S3DeletionService } from './s3-deletion.service';

@Module({
  imports: [S3Module],
  providers: [RentCycleCalculatorService, RentCycleCreationService, S3DeletionService],
  exports: [RentCycleCalculatorService, RentCycleCreationService, S3DeletionService],
})
export class CommonModule {}
