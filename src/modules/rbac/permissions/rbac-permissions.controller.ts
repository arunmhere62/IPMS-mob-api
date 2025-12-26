import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RbacService } from '../rbac.service';

@ApiTags('rbac')
@Controller('rbac/permissions')
export class RbacPermissionsController {
  constructor(private readonly rbacService: RbacService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List permissions catalog (permissions_master)' })
  @ApiResponse({ status: 200, description: 'Permissions retrieved successfully' })
  async listPermissions() {
    return this.rbacService.listPermissionsCatalog();
  }

  @Get('grouped')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List permissions catalog grouped by screen_name' })
  @ApiResponse({ status: 200, description: 'Grouped permissions retrieved successfully' })
  async listGroupedPermissions() {
    return this.rbacService.listPermissionsCatalogGrouped();
  }
}
