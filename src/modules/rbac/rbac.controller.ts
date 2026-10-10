import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { RbacService } from './rbac.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

type AuthenticatedRequest = {
  user?: { sub?: number; organization_id?: number | null };
};

@ApiTags('rbac')
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
  async getMyPermissions(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = Number(request.user?.sub);
    if (!Number.isSafeInteger(userId) || userId !== headers.user_id) {
      throw new ForbiddenException('User header does not match the authenticated user');
    }
    if (
      headers.organization_id != null &&
      Number(headers.organization_id) !== Number(request.user?.organization_id)
    ) {
      throw new ForbiddenException('Organization header does not match the authenticated user');
    }

    const organizationId = request.user?.organization_id == null
      ? null
      : Number(request.user.organization_id);
    await this.rbacService.checkAuthorization(userId, organizationId);
    return this.rbacService.getEffectivePermissionsForUser(userId, organizationId ?? undefined);
  }

  @Get('users/:userId/permissions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get effective permissions for a given user (role defaults + overrides)' })
  @ApiResponse({
    status: 200,
    description: 'Effective permissions retrieved successfully',
  })
  @UseGuards(HeadersValidationGuard, JwtAuthGuard)
  @RequireHeaders({ user_id: true, organization_id: true })
  async getUserPermissions(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Req() request: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    const actorId = Number(request.user?.sub);
    if (!Number.isSafeInteger(actorId) || actorId !== headers.user_id) {
      throw new ForbiddenException('User header does not match the authenticated user');
    }
    if (Number(request.user?.organization_id) !== headers.organization_id) {
      throw new ForbiddenException('Organization header does not match the authenticated user');
    }

    const authorization = await this.rbacService.checkAuthorization(
      actorId,
      headers.organization_id!,
      'employee_view',
    );
    if (!authorization.allowed) {
      throw new ForbiddenException('Missing required permission: employee_view');
    }

    return this.rbacService.getEffectivePermissionsForUser(userId, headers.organization_id);
  }
}
