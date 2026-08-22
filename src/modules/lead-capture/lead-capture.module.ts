import { Module } from '@nestjs/common';
import { LeadCaptureController } from './lead-capture.controller';
import { LeadCaptureService } from './lead-capture.service';

@Module({
  controllers: [LeadCaptureController],
  providers: [LeadCaptureService],
})
export class LeadCaptureModule {}
