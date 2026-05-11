import {
  Controller,
  Get,
  UseGuards,
  Req,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantPortalService } from './tenant-portal.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantJwtAuthGuard } from '../auth/guards/tenant-jwt-auth.guard';
import { ResponseUtil } from '../../common/utils/response.util';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

type RequestWithUser = {
  user: {
    tenantId: number;
    role: UserRole;
    pgId: number;
  };
};

@ApiTags('tenant-portal')
@Controller('tenant')
@UseGuards(TenantJwtAuthGuard, RolesGuard)
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
  async getProfile(@Req() req: RequestWithUser) {
    const tenantId = req.user.tenantId;
    // Reuse existing tenant service for full details
    const tenant = await this.tenantService.findOne(tenantId);
    return tenant;
  }

  @Get('payments')
  @ApiOperation({ summary: 'Get tenant payment history' })
  @ApiResponse({ status: 200, description: 'Payment history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  async getPayments(
    @Req() req: RequestWithUser,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    const tenantId = req.user.tenantId;
    return this.tenantPortalService.getTenantPayments(tenantId, page, limit);
  }

  @Get('dues')
  @ApiOperation({ summary: 'Get tenant pending dues' })
  @ApiResponse({ status: 200, description: 'Dues retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  async getDues(@Req() req: RequestWithUser) {
    const tenantId = req.user.tenantId;
    return this.tenantPortalService.getTenantDues(tenantId);
  }
}
