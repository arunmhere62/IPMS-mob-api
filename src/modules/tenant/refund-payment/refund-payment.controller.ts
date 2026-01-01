import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CreateRefundPaymentDto, UpdateRefundPaymentDto } from './dto';
import { HeadersValidationGuard } from '../../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../../common/decorators/validated-headers.decorator';
import { RefundPaymentService } from './refund-payment.service';

@ApiTags('refund-payments')
@Controller('refund-payments')
@UseGuards(HeadersValidationGuard)
export class RefundPaymentController {
  constructor(private readonly refundPaymentService: RefundPaymentService) {}

  @Post()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Create a new refund payment' })
  @ApiResponse({ status: 201, description: 'Refund payment created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Tenant/Room/Bed not found' })
  create(
    @Body() createRefundPaymentDto: CreateRefundPaymentDto,
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    // Ensure pg_id from headers is used
    createRefundPaymentDto.pg_id = headers.pg_id;
    return this.refundPaymentService.create(createRefundPaymentDto);
  }

  @Get()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get all refund payments with filters' })
  @ApiQuery({ name: 'tenant_id', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'month', required: false, type: String, description: 'Month name (e.g., January)' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Year (e.g., 2024)' })
  @ApiQuery({ name: 'start_date', required: false, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'end_date', required: false, type: String, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'room_id', required: false, type: Number })
  @ApiQuery({ name: 'bed_id', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'List of refund payments' })
  findAll(
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
    @Query('tenant_id') tenant_id?: string,
    @Query('status') status?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('room_id') room_id?: string,
    @Query('bed_id') bed_id?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.refundPaymentService.findAll(
      headers.pg_id,
      tenant_id ? parseInt(tenant_id) : undefined,
      status,
      month,
      year ? parseInt(year) : undefined,
      start_date,
      end_date,
      room_id ? parseInt(room_id) : undefined,
      bed_id ? parseInt(bed_id) : undefined,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
    );
  }

  @Get(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get a refund payment by ID' })
  @ApiResponse({ status: 200, description: 'Refund payment details' })
  @ApiResponse({ status: 404, description: 'Refund payment not found' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    return this.refundPaymentService.findOne(id, headers.pg_id);
  }

  @Patch(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Update a refund payment' })
  @ApiResponse({ status: 200, description: 'Refund payment updated successfully' })
  @ApiResponse({ status: 404, description: 'Refund payment not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRefundPaymentDto: UpdateRefundPaymentDto,
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    return this.refundPaymentService.update(id, updateRefundPaymentDto, headers.pg_id);
  }

  @Delete(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Delete a refund payment' })
  @ApiResponse({ status: 200, description: 'Refund payment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Refund payment not found' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    return this.refundPaymentService.remove(id, headers.pg_id);
  }
}
