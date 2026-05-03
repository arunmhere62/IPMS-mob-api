import { IsNotEmpty, IsNumber, IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRefundPaymentDto {
  @ApiProperty({ description: 'PG Location ID', example: 1 })
  @IsNumber()
  pg_id: number;

  @ApiProperty({ description: 'Tenant ID', example: 1 })
  @IsNotEmpty()
  @IsNumber()
  tenant_id: number;

  @ApiProperty({ description: 'Room ID', example: 1 })
  @IsNotEmpty()
  @IsNumber()
  room_id: number;

  @ApiProperty({ description: 'Bed ID', example: 1 })
  @IsNotEmpty()
  @IsNumber()
  bed_id: number;

  @ApiProperty({ description: 'Refund amount', example: 5000 })
  @IsNotEmpty()
  @IsNumber()
  amount_paid: number;

  @ApiProperty({
    description: 'Original payment amount (optional)',
    example: 6000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  actual_rent_amount?: number;

  @ApiProperty({ description: 'Refund date', example: '2024-01-15' })
  @IsNotEmpty()
  @IsDateString()
  payment_date: string;

  @ApiProperty({
    description: 'Payment method',
    example: 'BANK_TRANSFER',
    enum: ['GPAY', 'PHONEPE', 'CASH', 'BANK_TRANSFER'],
  })
  @IsNotEmpty()
  @IsEnum(['GPAY', 'PHONEPE', 'CASH', 'BANK_TRANSFER'])
  payment_method: 'GPAY' | 'PHONEPE' | 'CASH' | 'BANK_TRANSFER';

  @ApiProperty({
    description: 'Refund status',
    example: 'PAID',
    enum: ['PAID', 'PENDING', 'FAILED'],
  })
  @IsNotEmpty()
  @IsEnum(['PAID', 'PENDING', 'FAILED'])
  status: 'PAID' | 'PENDING' | 'FAILED';

  @ApiProperty({
    description: 'Additional remarks',
    example: 'Refunded security deposit',
    required: false,
  })
  @IsOptional()
  @IsString()
  remarks?: string;
}
