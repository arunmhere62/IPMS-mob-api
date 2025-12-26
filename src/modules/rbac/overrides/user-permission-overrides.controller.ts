import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeadersValidationGuard } from '../../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../../common/decorators/validated-headers.decorator';
import { UserPermissionOverridesService } from './user-permission-overrides.service';
import { UpsertUserPermissionOverrideDto } from './dto/upsert-user-permission-override.dto';
import { RemoveUserPermissionOverrideDto } from './dto/remove-user-permission-override.dto';
import { ListUserPermissionOverridesQueryDto } from './dto/list-user-permission-overrides.query.dto';

@ApiTags('rbac')
@Controller('user-permission-overrides')
@UseGuards(HeadersValidationGuard)
export class UserPermissionOverridesController {
  constructor(private readonly overridesService: UserPermissionOverridesService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List user permission overrides' })
  @ApiResponse({ status: 200, description: 'Overrides retrieved successfully' })
  @RequireHeaders({ user_id: true })
  async list(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Query() query: ListUserPermissionOverridesQueryDto,
  ) {
    const effectiveQuery: ListUserPermissionOverridesQueryDto = {
      ...query,
      user_id: query.user_id ?? headers.user_id,
    };

    return this.overridesService.list(effectiveQuery);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or replace one user permission override' })
  @ApiResponse({ status: 200, description: 'Override saved successfully' })
  @RequireHeaders({ user_id: true })
  async upsert(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Body() body: UpsertUserPermissionOverrideDto,
  ) {
    return this.overridesService.upsert(body, headers.user_id);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove one user permission override' })
  @ApiResponse({ status: 200, description: 'Override removed successfully' })
  @RequireHeaders({ user_id: true })
  async remove(@Body() body: RemoveUserPermissionOverrideDto) {
    return this.overridesService.remove(body);
  }
}
