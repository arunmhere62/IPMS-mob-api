import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length, IsOptional, IsInt } from 'class-validator';

export class SendPhoneOtpDto {
  @ApiProperty({ example: '918248449609', description: 'Phone number with country code' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 1, description: 'PG location ID to scope the uniqueness check' })
  @IsOptional()
  @IsInt()
  pg_id?: number;

  @ApiPropertyOptional({ example: 1, description: 'Organization ID to scope the uniqueness check' })
  @IsOptional()
  @IsInt()
  organization_id?: number;
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
