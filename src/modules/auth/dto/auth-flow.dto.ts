import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { SendOtpDto } from './send-otp.dto';
import { SignupDto } from './signup.dto';
import { VerifyOtpDto } from './verify-otp.dto';

export class FlowSendOtpDto extends SendOtpDto {}

export class FlowVerifyOtpDto extends VerifyOtpDto {}

export class FlowSetupDto extends SignupDto {
  @ApiProperty({
    description: 'Temporary setup token returned by /auth/flow/verify-otp for new users',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  setupToken: string;
}
