import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthDbService } from '../auth-db.service';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { LoginResponseDto } from '../dto/auth-response.dto';

@ApiTags('auth')
@Controller('auth')
export class OtpController {
  constructor(private readonly authService: AuthDbService) {}

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to user phone number (for login)' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found with this phone number' })
  @ApiResponse({ status: 400, description: 'Failed to send OTP' })
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(sendOtpDto);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend OTP to user phone number' })
  @ApiResponse({
    status: 200,
    description: 'OTP resent successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found with this phone number' })
  @ApiResponse({ status: 400, description: 'Failed to send OTP' })
  async resendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.resendOtp(sendOtpDto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and login user' })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto, @Req() req: Request) {
    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined) || req.ip;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.authService.verifyOtp(verifyOtpDto, ipAddress, userAgent);
  }

  @Post('send-signup-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to phone number for signup verification' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Failed to send OTP' })
  async sendSignupOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendSignupOtp(sendOtpDto);
  }

  @Post('verify-signup-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP for signup' })
  @ApiResponse({
    status: 200,
    description: 'Phone number verified successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  async verifySignupOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifySignupOtp(verifyOtpDto);
  }
}
