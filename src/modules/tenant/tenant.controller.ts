import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TransferTenantDto } from './dto/transfer-tenant.dto';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('tenants')
@Controller('tenants')
@UseGuards(HeadersValidationGuard, JwtAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Create a new tenant
   * POST /api/v1/tenants
   * Headers: pg_id, organization_id, user_id
   */
  @Post()
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  // @UseGuards(JwtAuthGuard) // TODO: Add authentication
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Body() createTenantDto: CreateTenantDto,
  ) {
    return this.tenantService.create(createTenantDto);
  }

  /**
   * Get all tenants with filters
   * GET /api/v1/tenants
   * Headers: pg_id, organization_id, user_id
   * Query: page, limit, status, search, room_id, pending_rent, pending_advance, partial_rent
   */
  @Get()
  @RequireHeaders({ pg_id: true })
  // @UseGuards(JwtAuthGuard) // TODO: Add authentication
  @ApiOperation({ summary: 'Get all tenants with filters' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'status', required: false, example: 'ACTIVE' })
  @ApiQuery({ name: 'search', required: false, example: 'john' })
  @ApiQuery({ name: 'room_id', required: false, example: 101 })
  @ApiQuery({ name: 'pending_rent', required: false, example: true })
  @ApiQuery({ name: 'pending_advance', required: false, example: true })
  @ApiQuery({ name: 'partial_rent', required: false, example: true })
  @ApiResponse({ status: 200, description: 'Tenants fetched successfully' })
  async findAll(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('room_id') room_id?: string,
    @Query('pending_rent') pending_rent?: string,
    @Query('pending_advance') pending_advance?: string,
    @Query('partial_rent') partial_rent?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;
    const roomId = room_id ? parseInt(room_id, 10) : undefined;
    const hasPendingRent = pending_rent === 'true';
    const hasPendingAdvance = pending_advance === 'true';
    const hasPartialRent = partial_rent === 'true';

    return this.tenantService.findAll({
      page: pageNumber,
      limit: limitNumber,
      pg_id: headers.pg_id!,
      status,
      search,
      room_id: roomId,
      pending_rent: hasPendingRent,
      pending_advance: hasPendingAdvance,
      partial_rent: hasPartialRent,
    });
  }

  /**
   * Get tenant by ID
   * GET /api/v1/tenants/:id
   * Headers: pg_id, organization_id, user_id
   */
  @Get(':id')
  @RequireHeaders()
  // @UseGuards(JwtAuthGuard) // TODO: Add authentication
  @ApiOperation({ summary: 'Get tenant by ID' })
  @ApiParam({ name: 'id', description: 'Tenant ID', example: 1 })
  @ApiResponse({ status: 200, description: 'Tenant fetched successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async findOne(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tenantService.findOne(id);
  }

  /**
   * Update tenant
   * PUT /api/v1/tenants/:id
   * Headers: pg_id, organization_id, user_id
   */
  @Put(':id')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  // @UseGuards(JwtAuthGuard) // TODO: Add authentication
  @ApiOperation({ summary: 'Update tenant' })
  @ApiParam({ name: 'id', description: 'Tenant ID', example: 1 })
  @ApiResponse({ status: 200, description: 'Tenant updated successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async update(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTenantDto: UpdateTenantDto,
  ) {
    return this.tenantService.update(id, updateTenantDto);
  }

  /**
   * Delete tenant (soft delete)
   * DELETE /api/v1/tenants/:id
   * Headers: pg_id, organization_id, user_id
   */
  @Delete(':id')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  // @UseGuards(JwtAuthGuard) // TODO: Add authentication
  @ApiOperation({ summary: 'Delete tenant (soft delete)' })
  @ApiParam({ name: 'id', description: 'Tenant ID', example: 1 })
  @ApiResponse({ status: 200, description: 'Tenant deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async remove(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tenantService.remove(id);
  }

  /**
   * Transfer tenant to another PG/room/bed (supports effective date)
   * POST /api/v1/tenants/:id/transfer
   */
  @Post(':id/transfer')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  @ApiOperation({ summary: 'Transfer tenant to another PG/room/bed' })
  @ApiParam({ name: 'id', description: 'Tenant ID', example: 1 })
  @ApiResponse({ status: 200, description: 'Tenant transferred successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async transferTenant(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) id: number,
    @Body() transferTenantDto: TransferTenantDto,
  ) {
    return this.tenantService.transferTenant(id, transferTenantDto);
  }
}
