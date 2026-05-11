import { Controller, Post, Body, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { TenantJwtAuthGuard } from '../../auth/guards/tenant-jwt-auth.guard';
import { TenantAuthService } from './tenant-auth.service';
import { TenantSendOtpDto } from './dto/tenant-send-otp.dto';
import { TenantVerifyOtpDto } from './dto/tenant-verify-otp.dto';
import {
  TenantAuthResponseDto,
  TenantLoginResponseDto,
} from './dto/tenant-login-response.dto';

@ApiTags('tenant-auth')
@Controller('tenant-auth')
export class TenantAuthController {
  constructor(private readonly tenantAuthService: TenantAuthService) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to tenant phone number for login' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    type: TenantAuthResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Tenant not found with this phone number',
  })
  @ApiResponse({ status: 400, description: 'Portal access not enabled' })
  async sendOtp(@Body() dto: TenantSendOtpDto) {
    return this.tenantAuthService.sendOtp(dto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and login tenant' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: TenantLoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async verifyOtp(@Body() dto: TenantVerifyOtpDto) {
    return this.tenantAuthService.verifyOtp(dto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh tenant access token' })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.tenantAuthService.refreshToken(refreshToken);
  }

  @Post('logout')
  @UseGuards(TenantJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout tenant' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Req() req: Request) {
    const tenantId = (req as any).user?.tenantId;
    return this.tenantAuthService.logout(tenantId);
  }
}
