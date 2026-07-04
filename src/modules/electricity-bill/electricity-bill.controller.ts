import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ElectricityBillService } from './electricity-bill.service';
import { CreateElectricityBillDto, RecordPaymentDto, GetEligibleTenantsDto } from './dto';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';

@ApiTags('electricity-bills')
@Controller('electricity-bills')
@UseGuards(HeadersValidationGuard)
export class ElectricityBillController {
  constructor(private readonly electricityBillService: ElectricityBillService) {}

  @Post()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Create a new electricity bill for a room' })
  @ApiResponse({ status: 201, description: 'Electricity bill created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  create(
    @Body() createDto: CreateElectricityBillDto,
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    createDto.pg_id = headers.pg_id;
    return this.electricityBillService.create(createDto);
  }

  @Get()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get all electricity bills for the PG or a specific room' })
  @ApiQuery({ name: 'room_id', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'year', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'List of electricity bills' })
  findAll(
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
    @Query('room_id') room_id?: string,
    @Query('status') status?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.electricityBillService.findAll({
      pg_id: headers.pg_id,
      room_id: room_id ? parseInt(room_id, 10) : undefined,
      status,
      year: year ? parseInt(year, 10) : undefined,
      month: month ? parseInt(month, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('eligible-tenants')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get eligible tenants for a bill period with occupancy details' })
  @ApiResponse({ status: 200, description: 'List of eligible tenants with occupancy details' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  getEligibleTenantsForPeriod(
    @Query() query: GetEligibleTenantsDto,
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    return this.electricityBillService.getEligibleTenantsForPeriod(
      query.room_id,
      headers.pg_id,
      query.bill_period_start,
      query.bill_period_end,
    );
  }

  @Get('tenant/:tenant_id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get pending electricity bill items for a tenant' })
  @ApiResponse({ status: 200, description: 'List of pending bill items' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  getPendingItemsByTenant(@Param('tenant_id', ParseIntPipe) tenant_id: number) {
    return this.electricityBillService.findPendingItemsByTenant(tenant_id);
  }

  @Get(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get an electricity bill by ID' })
  @ApiResponse({ status: 200, description: 'Electricity bill details' })
  @ApiResponse({ status: 404, description: 'Electricity bill not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.electricityBillService.findOne(id);
  }

  @Post('payments')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Record a payment for an electricity bill item' })
  @ApiResponse({ status: 200, description: 'Payment recorded successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Bill item not found' })
  recordPayment(
    @Body() recordPaymentDto: RecordPaymentDto,
    @ValidatedHeaders() _headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    void _headers;
    return this.electricityBillService.recordPayment(recordPaymentDto);
  }

  @Delete(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Delete an electricity bill' })
  @ApiResponse({ status: 200, description: 'Electricity bill deleted successfully' })
  @ApiResponse({ status: 404, description: 'Electricity bill not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.electricityBillService.remove(id);
  }
}
