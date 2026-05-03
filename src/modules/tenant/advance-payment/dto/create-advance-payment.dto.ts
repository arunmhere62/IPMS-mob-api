import { IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAdvancePaymentDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsNotEmpty()
  @IsNumber()
  tenant_id: number;

  @ApiProperty({ description: 'PG Location ID' })
  @IsOptional()
  @IsNumber()
  pg_id?: number;

  @ApiProperty({ description: 'Room ID' })
  @IsNotEmpty()
  @IsNumber()
  room_id: number;

  @ApiProperty({ description: 'Bed ID' })
  @IsNotEmpty()
  @IsNumber()
  bed_id: number;

  @ApiProperty({ description: 'Amount paid', example: 5000 })
  @IsNotEmpty()
  @IsNumber()
  amount_paid: number;

  @ApiProperty({ description: 'Actual rent amount', example: 5000, required: false })
  @IsOptional()
  @IsNumber()
  actual_rent_amount?: number;

  @ApiProperty({ description: 'Payment date', example: '2024-01-15', required: false })
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiProperty({
    description: 'Payment method',
    enum: ['CASH', 'GPAY', 'PHONEPE', 'BANK_TRANSFER', 'UPI', 'CARD'],
    example: 'CASH',
  })
  @IsNotEmpty()
  @IsEnum(['CASH', 'GPAY', 'PHONEPE', 'BANK_TRANSFER', 'UPI', 'CARD'])
  payment_method: string;

  @ApiProperty({
    description: 'Payment status',
    enum: ['PENDING', 'PAID', 'FAILED'],
    example: 'PAID',
    required: false,
  })
  @IsOptional()
  @IsEnum(['PENDING', 'PAID', 'FAILED'])
  status?: string;

  @ApiProperty({ description: 'Remarks', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}
