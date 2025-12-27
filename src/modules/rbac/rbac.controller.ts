import { Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { RbacService } from './rbac.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('me/permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get effective permissions for the logged-in user' })
  @ApiResponse({
    status: 200,
    description: 'Effective permissions retrieved successfully',
  })
  @UseGuards(HeadersValidationGuard, JwtAuthGuard)
  @RequireHeaders({ user_id: true })
  async getMyPermissions(@ValidatedHeaders() headers: ValidatedHeaders) {
    return this.rbacService.getEffectivePermissionsForUser(headers.user_id as number);
  }

  @Get('users/:userId/permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get effective permissions for a given user (role defaults + overrides)' })
  @ApiResponse({
    status: 200,
    description: 'Effective permissions retrieved successfully',
  })
  @UseGuards(HeadersValidationGuard, JwtAuthGuard)
  @RequireHeaders({ user_id: true })
  async getUserPermissions(
    @ValidatedHeaders() _headers: ValidatedHeaders,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.rbacService.getEffectivePermissionsForUser(userId);
  }
}
