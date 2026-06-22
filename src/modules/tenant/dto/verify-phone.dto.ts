import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length } from 'class-validator';

export class SendPhoneOtpDto {
  @ApiProperty({ example: '918248449609', description: 'Phone number with country code' })
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class VerifyPhoneOtpDto {
  @ApiProperty({ example: '918248449609', description: 'Phone number with country code' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '1234', description: '4-digit OTP' })
  @IsString()
  @Length(4, 4)
  otp: string;
}
