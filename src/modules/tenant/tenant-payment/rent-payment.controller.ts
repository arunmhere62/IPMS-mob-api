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
  MethodNotAllowedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TenantPaymentService } from './rent-payment.service';
import { CreateTenantPaymentDto, UpdateTenantPaymentDto } from './dto';
import { HeadersValidationGuard } from '../../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../../common/decorators/validated-headers.decorator';

@ApiTags('tenant-payments')
@Controller('tenant-payments')
@UseGuards(HeadersValidationGuard)
export class TenantPaymentController {
  constructor(private readonly tenantPaymentService: TenantPaymentService) {}

  @Post()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Create a new tenant payment' })
  @ApiResponse({ status: 201, description: 'Tenant payment created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Tenant/Room/Bed not found' })
  create(
    @Body() createTenantPaymentDto: CreateTenantPaymentDto,
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    // Ensure pg_id from headers is used
    createTenantPaymentDto.pg_id = headers.pg_id;
    return this.tenantPaymentService.create(createTenantPaymentDto);
  }

  @Get()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get all tenant payments with filters' })
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
  @ApiResponse({ status: 200, description: 'List of tenant payments' })
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
    return this.tenantPaymentService.findAll(
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
  @ApiOperation({ summary: 'Get all payments for a specific tenant' })
  @ApiResponse({ status: 200, description: 'List of tenant payments' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getPaymentsByTenant(@Param('tenant_id', ParseIntPipe) tenant_id: number) {
    return this.tenantPaymentService.getPaymentsByTenant(tenant_id);
  }

  @Get(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get a tenant payment by ID' })
  @ApiResponse({ status: 200, description: 'Tenant payment details' })
  @ApiResponse({ status: 404, description: 'Tenant payment not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenantPaymentService.findOne(id);
  }

  @Patch(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Update a tenant payment' })
  @ApiResponse({ status: 200, description: 'Tenant payment updated successfully' })
  @ApiResponse({ status: 404, description: 'Tenant payment not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTenantPaymentDto: UpdateTenantPaymentDto,
  ) {
    throw new MethodNotAllowedException(
      'Tenant payments are immutable. Create a new payment entry instead of editing an existing one.',
    );
  }

  @Patch(':id/status')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Update payment status (pending to paid)' })
  @ApiResponse({ status: 200, description: 'Payment status updated successfully' })
  @ApiResponse({ status: 404, description: 'Tenant payment not found' })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string; payment_date?: string },
  ) {
    return this.tenantPaymentService.updateStatus(id, body.status, body.payment_date);
  }

  @Delete(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Delete a tenant payment (soft delete)' })
  @ApiResponse({ status: 200, description: 'Tenant payment deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tenant payment not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenantPaymentService.remove(id);
  }

  @Get('gaps/:tenant_id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Detect payment gaps for a tenant' })
  @ApiResponse({ status: 200, description: 'Gap detection result' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  detectGaps(@Param('tenant_id', ParseIntPipe) tenant_id: number) {
    return this.tenantPaymentService.detectPaymentGaps(tenant_id);
  }

  @Get('next-dates/:tenant_id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get suggested next payment dates (with gap detection)' })
  @ApiQuery({ name: 'rentCycleType', required: false, type: String, description: 'CALENDAR or MIDMONTH' })
  @ApiQuery({ name: 'skipGaps', required: false, type: Boolean, description: 'Skip gaps and get next payment after last payment' })
  @ApiResponse({ status: 200, description: 'Suggested payment dates' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getNextPaymentDates(
    @Param('tenant_id', ParseIntPipe) tenant_id: number,
    @Query('rentCycleType') rentCycleType: string = 'CALENDAR',
    @Query('skipGaps') skipGaps: string = 'false',
  ) {
    const skipGapsBoolean = skipGaps === 'true';
    return this.tenantPaymentService.getNextPaymentDates(tenant_id, rentCycleType, skipGapsBoolean);
  }
}
