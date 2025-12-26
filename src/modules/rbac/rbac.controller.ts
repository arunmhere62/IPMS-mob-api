import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';
import { RbacService } from './rbac.service';

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
  @UseGuards(HeadersValidationGuard)
  @RequireHeaders({ user_id: true })
  async getMyPermissions(@ValidatedHeaders() headers: ValidatedHeaders) {
    return this.rbacService.getEffectivePermissionsForUser(headers.user_id as number);
  }
}
