import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoidTenantPaymentDto {
  @ApiProperty({ description: 'Reason for voiding this payment (required for audit)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  voided_reason: string;
}
