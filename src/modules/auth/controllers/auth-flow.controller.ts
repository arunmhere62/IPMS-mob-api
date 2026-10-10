import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthFlowService } from '../auth-flow.service';
import { FlowSendOtpDto, FlowSetupDto, FlowVerifyOtpDto } from '../dto/auth-flow.dto';
import { AuthResponseDto, LoginResponseDto } from '../dto/auth-response.dto';

@ApiTags('auth')
@Controller('auth/flow')
export class AuthFlowController {
  constructor(private readonly authFlowService: AuthFlowService) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unified OTP send for login or signup' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    type: AuthResponseDto,
  })
  async sendOtp(
    @Body() dto: FlowSendOtpDto,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ipAddress = forwardedFor || undefined;
    return this.authFlowService.sendOtp(dto, ipAddress, userAgent);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unified OTP verify for login or signup' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully',
    type: AuthResponseDto,
  })
  async verifyOtp(
    @Body() dto: FlowVerifyOtpDto,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ipAddress = forwardedFor || undefined;
    return this.authFlowService.verifyOtp(dto, ipAddress, userAgent);
  }

  @Post('setup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete signup and login for a verified phone' })
  @ApiResponse({
    status: 200,
    description: 'Account created and logged in successfully',
    type: LoginResponseDto,
  })
  async setup(
    @Body() dto: FlowSetupDto,
    @Headers('authorization') authorization?: string,
    @Headers('x-forwarded-for') forwardedFor?: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const ipAddress = forwardedFor || undefined;
    const setupToken = this.extractBearerToken(authorization);
    return this.authFlowService.setupAndLogin(dto, setupToken, ipAddress, userAgent);
  }

  private extractBearerToken(header?: string): string {
    if (!header) {
      return '';
    }
    const parts = header.split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      return parts[1];
    }
    return header;
  }
}
