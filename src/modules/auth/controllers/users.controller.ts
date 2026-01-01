import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthDbService } from '../auth-db.service';
import { CommonHeaders, CommonHeadersDecorator } from '../../../common/decorators/common-headers.decorator';

@ApiTags('auth')
@Controller('auth')
export class UsersController {
  constructor(private readonly authService: AuthDbService) {}

  @Get('users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all users for organization' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully' })
  async getUsers(@CommonHeadersDecorator() headers: CommonHeaders) {
    return this.authService.getUsers(headers.organization_id);
  }

  @Get('roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all roles for organization (excluding Super Admin)' })
  @ApiResponse({ status: 200, description: 'Roles retrieved successfully' })
  async getRoles(@CommonHeadersDecorator() headers: CommonHeaders) {
    return this.authService.getRoles(headers.organization_id);
  }
}
