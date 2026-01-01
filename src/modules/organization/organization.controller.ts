import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';

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
  async getOrganizationById(@Query('id') id: string) {
    return this.organizationService.getOrganizationById(parseInt(id, 10));
  }
}
