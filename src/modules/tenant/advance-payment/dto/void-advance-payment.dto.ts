import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoidAdvancePaymentDto {
  @ApiProperty({ description: 'Reason for voiding this advance payment (required for audit)' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  voided_reason: string;
}
