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
import { AdvancePaymentService } from './advance-payment.service';
import { CreateAdvancePaymentDto, UpdateAdvancePaymentDto } from './dto';
import { HeadersValidationGuard } from '../../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../../common/decorators/validated-headers.decorator';

@ApiTags('advance-payments')
@Controller('advance-payments')
@UseGuards(HeadersValidationGuard)
export class AdvancePaymentController {
  constructor(private readonly advancePaymentService: AdvancePaymentService) {}

  @Post()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Create a new advance payment' })
  @ApiResponse({ status: 201, description: 'Advance payment created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Tenant/Room/Bed not found' })
  create(
    @Body() createAdvancePaymentDto: CreateAdvancePaymentDto,
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    // Ensure pg_id from headers is used
    createAdvancePaymentDto.pg_id = headers.pg_id;
    return this.advancePaymentService.create(createAdvancePaymentDto);
  }

  @Get()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get all advance payments with filters' })
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
  @ApiResponse({ status: 200, description: 'List of advance payments' })
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
    return this.advancePaymentService.findAll(
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

  @Get('tenant/:tenant_id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get all advance payments for a specific tenant' })
  @ApiResponse({ status: 200, description: 'List of advance payments' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getPaymentsByTenant(@Param('tenant_id', ParseIntPipe) tenant_id: number) {
    return this.advancePaymentService.getPaymentsByTenant(tenant_id);
  }

  @Get(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get an advance payment by ID' })
  @ApiResponse({ status: 200, description: 'Advance payment details' })
  @ApiResponse({ status: 404, description: 'Advance payment not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.advancePaymentService.findOne(id);
  }

  @Patch(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Update an advance payment' })
  @ApiResponse({ status: 200, description: 'Advance payment updated successfully' })
  @ApiResponse({ status: 404, description: 'Advance payment not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateAdvancePaymentDto: UpdateAdvancePaymentDto,
  ) {
    return this.advancePaymentService.update(id, updateAdvancePaymentDto);
  }

  @Patch(':id/status')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Update advance payment status' })
  @ApiResponse({ status: 200, description: 'Advance payment status updated successfully' })
  @ApiResponse({ status: 404, description: 'Advance payment not found' })
  @ApiResponse({ status: 400, description: 'Invalid status' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string; payment_date?: string },
  ) {
    return this.advancePaymentService.updateStatus(id, body.status, body.payment_date);
  }

  @Delete(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Delete an advance payment (soft delete)' })
  @ApiResponse({ status: 200, description: 'Advance payment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Advance payment not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.advancePaymentService.remove(id);
  }
}
