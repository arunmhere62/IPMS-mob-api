import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class TenantSendOtpDto {
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
}
