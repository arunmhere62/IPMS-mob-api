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
import { TenantService } from './tenant.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
   * Get tenants with pending rent
   * GET /api/v1/tenants/pending-rent
   * Headers: pg_id, organization_id, user_id
   */
  @Get('pending-rent')
  @RequireHeaders()
  async getTenantsWithPendingRent(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page) : 1;
    const limitNumber = limit ? parseInt(limit) : 10;

    return this.tenantService.getTenantsWithPendingRent({
      page: pageNumber,
      limit: limitNumber,
      pg_id: headers.pg_id!,
    });
  }

  /**
   * Get tenants with partial rent
   * GET /api/v1/tenants/partial-rent
   * Headers: pg_id, organization_id, user_id
   */
  @Get('partial-rent')
  @RequireHeaders()
  async getTenantsWithPartialRent(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page) : 1;
    const limitNumber = limit ? parseInt(limit) : 10;

    return this.tenantService.getTenantsWithPartialRent({
      page: pageNumber,
      limit: limitNumber,
      pg_id: headers.pg_id!,
    });
  }

  /**
   * Get tenants without advance payment
   * GET /api/v1/tenants/pending-advance
   * Headers: pg_id, organization_id, user_id
   */
  @Get('pending-advance')
  @RequireHeaders()
  async getTenantsWithoutAdvance(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page) : 1;
    const limitNumber = limit ? parseInt(limit) : 10;

    return this.tenantService.getTenantsWithoutAdvance({
      page: pageNumber,
      limit: limitNumber,
      pg_id: headers.pg_id!,
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
  async remove(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.tenantService.remove(id);
  }

  /**
   * Get detailed pending rent information for a specific tenant
   * Headers: pg_id, organization_id, user_id
   */
  @Get(':id/pending-rent-details')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async getTenantPendingRentDetails(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Param('id', ParseIntPipe) tenantId: number,
  ) {
    return this.tenantService.getTenantPendingRentDetails(tenantId);
  }

  /**
   * Get pending rent summary for all tenants
   * Headers: pg_id, organization_id, user_id
   */
  @Get('pending-rent-summary')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async getAllTenantsPendingRentSummary(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.tenantService.getAllTenantsPendingRentSummary({
      ...headers,
      page: parseInt(page),
      limit: parseInt(limit),
    });
  }

  /**
   * Get tenants with overdue payments
   * Headers: pg_id, organization_id, user_id
   */
  @Get('overdue-tenants')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async getOverdueTenants(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query('min_amount') minAmount: string = '0',
  ) {
    return this.tenantService.getOverdueTenants({
      ...headers,
      min_amount: minAmount,
    });
  }

  /**
   * Get pending rent statistics for dashboard
   * Headers: pg_id, organization_id, user_id
   */
  @Get('pending-rent-stats')
  @RequireHeaders({ pg_id: true, organization_id: true, user_id: true })
  async getPendingRentStats(
    @ValidatedHeaders() headers: ValidatedHeaders,
  ) {
    return this.tenantService.getPendingRentStats(headers);
  }
}
