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
import { CurrentBillService } from './current-bill.service';
import { CreateCurrentBillDto, UpdateCurrentBillDto } from './dto';
import { HeadersValidationGuard } from '../../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../../common/decorators/validated-headers.decorator';

@ApiTags('current-bills')
@Controller('current-bills')
@UseGuards(HeadersValidationGuard)
export class CurrentBillController {
  constructor(private readonly currentBillService: CurrentBillService) {}

  @Post()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ 
    summary: 'Create a new current bill',
    description: 'Create a current bill with two modes: 1) Split bill for a room (provide room_id with split_equally=true), 2) Individual bill for a tenant (provide tenant_id)'
  })
  @ApiResponse({ status: 201, description: 'Current bill created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Tenant/Room not found' })
  create(
    @Body() createCurrentBillDto: CreateCurrentBillDto,
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
  ) {
    // Ensure pg_id from headers is used
    createCurrentBillDto.pg_id = headers.pg_id;
    return this.currentBillService.create(createCurrentBillDto);
  }

  @Get()
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get all current bills with filters' })
  @ApiQuery({ name: 'tenant_id', required: false, type: Number })
  @ApiQuery({ name: 'room_id', required: false, type: Number })
  @ApiQuery({ name: 'month', required: false, type: String, description: 'Month name (e.g., January)' })
  @ApiQuery({ name: 'year', required: false, type: Number, description: 'Year (e.g., 2024)' })
  @ApiQuery({ name: 'start_date', required: false, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'end_date', required: false, type: String, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'List of current bills' })
  findAll(
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
    @Query('tenant_id') tenant_id?: string,
    @Query('room_id') room_id?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.currentBillService.findAll(
      headers.pg_id,
      tenant_id ? parseInt(tenant_id) : undefined,
      room_id ? parseInt(room_id) : undefined,
      month,
      year ? parseInt(year) : undefined,
      start_date,
      end_date,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
    );
  }

  @Get('by-month/:month/:year')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get current bills for a specific month and year' })
  @ApiQuery({ name: 'tenant_id', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Bills for the specified month' })
  findByMonth(
    @ValidatedHeaders() headers: { pg_id: number; organization_id: number; user_id: number },
    @Param('month', ParseIntPipe) month: number,
    @Param('year', ParseIntPipe) year: number,
    @Query('tenant_id') tenant_id?: string,
  ) {
    return this.currentBillService.findByMonth(
      headers.pg_id,
      month,
      year,
      tenant_id ? parseInt(tenant_id) : undefined,
    );
  }

  @Get(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Get a single current bill by ID' })
  @ApiResponse({ status: 200, description: 'Current bill details' })
  @ApiResponse({ status: 404, description: 'Current bill not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.currentBillService.findOne(id);
  }

  @Patch(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Update a current bill' })
  @ApiResponse({ status: 200, description: 'Current bill updated successfully' })
  @ApiResponse({ status: 404, description: 'Current bill not found' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCurrentBillDto: UpdateCurrentBillDto,
  ) {
    return this.currentBillService.update(id, updateCurrentBillDto);
  }

  @Delete(':id')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Delete a current bill' })
  @ApiResponse({ status: 200, description: 'Current bill deleted successfully' })
  @ApiResponse({ status: 404, description: 'Current bill not found' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.currentBillService.remove(id);
  }
}
