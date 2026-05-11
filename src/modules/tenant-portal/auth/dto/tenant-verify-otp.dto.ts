import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, Length } from 'class-validator';

export class TenantVerifyOtpDto {
  @ApiProperty({
    description: 'Tenant phone number with country code',
    example: '+919876543210',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\+91\s?[6-9]\d{9}$/, {
    message: 'Phone must be a valid Indian mobile number with +91 prefix',
  })
  phone: string;

  @ApiProperty({
    description: '4-digit OTP code',
    example: '1234',
  })
  @IsNotEmpty()
  @IsString()
  @Length(4, 4, { message: 'OTP must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'OTP must contain only digits' })
  otp: string;
}
