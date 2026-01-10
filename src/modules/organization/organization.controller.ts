import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, Request, UseGuards } from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';

type AuthedRequest = ExpressRequest & {
  user?: {
    s_no?: number;
    role_name?: string;
  };
};

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  /**
   * Get all organizations with admin details (SuperAdmin only)
   * GET /api/v1/organizations
   */
  @Get()
  // @UseGuards(JwtAuthGuard, SuperAdminGuard) // TODO: Add authentication guards
  @ApiOperation({ summary: 'Get all organizations for SuperAdmin' })
  @ApiResponse({ status: 200, description: 'Organizations retrieved successfully' })
  async getAllOrganizations(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNumber = page ? parseInt(page, 10) : 1;
    const limitNumber = limit ? parseInt(limit, 10) : 10;

    return this.organizationService.getAllOrganizations({
      page: pageNumber,
      limit: limitNumber,
    });
  }

  /**
   * Get organization statistics (SuperAdmin only)
   * GET /api/v1/organizations/stats
   */
  @Get('stats')
  // @UseGuards(JwtAuthGuard, SuperAdminGuard) // TODO: Add authentication guards
  @ApiOperation({ summary: 'Get organization statistics (SuperAdmin only)' })
  @ApiResponse({ status: 200, description: 'Organization stats retrieved successfully' })
  async getOrganizationStats() {
    return this.organizationService.getOrganizationStats();
  }

  /**
   * Get organization details by ID (SuperAdmin only)
   * GET /api/v1/organizations/:id
   */
  @Get(':id')
  // @UseGuards(JwtAuthGuard, SuperAdminGuard) // TODO: Add authentication guards
  @ApiOperation({ summary: 'Get organization details by ID (SuperAdmin only)' })
  @ApiResponse({ status: 200, description: 'Organization retrieved successfully' })
  async getOrganizationById(@Param('id', ParseIntPipe) id: number) {
    return this.organizationService.getOrganizationById(id);
  }

  @Patch(':id')
  @UseGuards(HeadersValidationGuard, JwtAuthGuard)
  @RequireHeaders({ organization_id: true, user_id: true })
  @ApiOperation({ summary: 'Update organization (Admin: own org only, SuperAdmin: any)' })
  @ApiResponse({ status: 200, description: 'Organization updated successfully' })
  async updateOrganization(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateOrganizationDto,
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Request() req: AuthedRequest,
  ) {
    return this.organizationService.updateOrganization(id, updateDto, headers, req.user);
  }
}
