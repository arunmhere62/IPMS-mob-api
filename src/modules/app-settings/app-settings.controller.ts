import { Controller, Get, Put, Body, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AppSettingsService } from './app-settings.service';
import { UpdateAppSettingsDto } from './dto/update-app-settings.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ValidatedHeaders } from '../../common/decorators/validated-headers.decorator';

@ApiTags('App Settings')
@Controller('app-settings')
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  // Public endpoint for app to check version/maintenance
  @Get('status')
  @ApiOperation({ summary: 'Get public app status (maintenance, version, announcements)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'App status fetched successfully' })
  async getPublicStatus() {
    return this.appSettingsService.getPublicStatus();
  }

  // Protected endpoints - require authentication
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all app settings' })
  @ApiResponse({ status: HttpStatus.OK, description: 'App settings fetched successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Settings not found' })
  async findOne() {
    return this.appSettingsService.findOne();
  }

  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update app settings' })
  @ApiResponse({ status: HttpStatus.OK, description: 'App settings updated successfully' })
  async update(
    @ValidatedHeaders() headers: ValidatedHeaders,
    @Body() dto: UpdateAppSettingsDto,
  ) {
    return this.appSettingsService.update(headers, dto);
  }
}
