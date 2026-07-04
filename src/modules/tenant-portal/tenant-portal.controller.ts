import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantPortalService } from './tenant-portal.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantJwtAuthGuard } from '../auth/guards/tenant-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { TenantHeadersDecorator, TenantHeaders } from '../../common/decorators/tenant-headers.decorator';
import { TenantHeadersValidationGuard } from '../../common/guards/tenant-headers-validation.guard';

@ApiTags('tenant-portal')
@Controller('tenant')
@UseGuards(TenantJwtAuthGuard, TenantHeadersValidationGuard, RolesGuard)
@Roles(UserRole.TENANT)
@ApiBearerAuth()
export class TenantPortalController {
  constructor(
    private readonly tenantPortalService: TenantPortalService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get tenant profile and current allocation' })
  @ApiResponse({ status: 200, description: 'Tenant profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getProfile(@TenantHeadersDecorator() headers: TenantHeaders) {
    // Reuse existing tenant service for full details
    const tenant = await this.tenantService.findOne(headers.tenant_id);
    return tenant;
  }

  @Get('payments')
  @ApiOperation({ summary: 'Get tenant payment history' })
  @ApiResponse({ status: 200, description: 'Payment history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  async getPayments(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.tenantPortalService.getTenantPayments(headers.tenant_id, page, limit);
  }

  @Get('dues')
  @ApiOperation({ summary: 'Get tenant pending dues' })
  @ApiResponse({ status: 200, description: 'Dues retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  async getDues(@TenantHeadersDecorator() headers: TenantHeaders) {
    return this.tenantPortalService.getTenantDues(headers.tenant_id);
  }

  @Get('ticket-stats')
  @ApiOperation({ summary: 'Get tenant dashboard ticket statistics' })
  @ApiResponse({ status: 200, description: 'Ticket statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  async getTicketStats(@TenantHeadersDecorator() headers: TenantHeaders) {
    return this.tenantPortalService.getTenantTicketDashboardStats({ tenant_id: headers.tenant_id });
  }

  @Patch('expected-vacate-date')
  @ApiOperation({ summary: 'Update tenant expected vacate date' })
  @ApiResponse({ status: 200, description: 'Expected vacate date updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async updateExpectedVacateDate(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Body() body: { expected_vacate_date: string | null },
  ) {
    return this.tenantService.update(headers.tenant_id, {
      expected_vacate_date: body.expected_vacate_date,
    });
  }
}
