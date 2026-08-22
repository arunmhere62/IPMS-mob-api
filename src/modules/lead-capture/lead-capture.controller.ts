import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LeadCaptureService } from './lead-capture.service';
import { LeadCaptureDto } from './lead-capture.dto';

@ApiTags('lead-capture')
@Controller('lead-capture')
export class LeadCaptureController {
  constructor(private readonly leadCaptureService: LeadCaptureService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a lead from the website popup (public, no auth)' })
  @ApiResponse({ status: 200, description: 'Lead submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async submit(@Body() dto: LeadCaptureDto) {
    return this.leadCaptureService.submitLead(dto);
  }
}
