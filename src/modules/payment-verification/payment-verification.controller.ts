import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PaymentVerificationService } from './payment-verification.service';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';

@ApiTags('payment-verification')
@ApiBearerAuth()
@Controller('payment-verification')
@UseGuards(HeadersValidationGuard)
export class PaymentVerificationController {
  constructor(private readonly verificationService: PaymentVerificationService) {}

  @Get()
  @RequireHeaders({ organization_id: true })
  @ApiOperation({ summary: 'List all payment submissions for verification' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'SUBMITTED | VERIFIED | REJECTED | ALL' })
  @ApiQuery({ name: 'pg_id', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @ValidatedHeaders() headers: { organization_id: number },
    @Query('status') status?: string,
    @Query('pg_id', new ParseIntPipe({ optional: true })) pg_id?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.verificationService.findAll(headers.organization_id, {
      status,
      pg_id,
      page,
      limit,
    });
  }

  @Get('stats')
  @RequireHeaders({ organization_id: true })
  @ApiOperation({ summary: 'Get verification statistics' })
  async getStats(@ValidatedHeaders() headers: { organization_id: number }) {
    return this.verificationService.getStats(headers.organization_id);
  }

  @Get(':id')
  @RequireHeaders({ organization_id: true })
  @ApiOperation({ summary: 'Get a single submission with full details' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @ValidatedHeaders() headers: { organization_id: number },
  ) {
    return this.verificationService.findOne(id, headers.organization_id);
  }

  @Post(':id/verify')
  @RequireHeaders({ organization_id: true, user_id: true })
  @ApiOperation({ summary: 'Verify (approve) a payment submission' })
  @ApiResponse({ status: 200, description: 'Payment verified and rent payment marked as PAID' })
  async verify(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { notes?: string },
    @ValidatedHeaders() headers: { organization_id: number; user_id: number },
  ) {
    return this.verificationService.verify(
      id,
      headers.organization_id,
      headers.user_id,
      body.notes,
    );
  }

  @Post(':id/reject')
  @RequireHeaders({ organization_id: true, user_id: true })
  @ApiOperation({ summary: 'Reject a payment submission' })
  @ApiResponse({ status: 200, description: 'Payment rejected. Tenant can resubmit.' })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { rejection_reason: string },
    @ValidatedHeaders() headers: { organization_id: number; user_id: number },
  ) {
    return this.verificationService.reject(
      id,
      headers.organization_id,
      headers.user_id,
      body.rejection_reason,
    );
  }
}
