import { IsNotEmpty, IsNumber, IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum PaymentMethod {
  GPAY = 'GPAY',
  PHONEPE = 'PHONEPE',
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum PaymentStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
}

export class CreateTenantPaymentDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsNotEmpty()
  @IsNumber()
  tenant_id: number;

  @ApiProperty({ description: 'PG Location ID' })
  @IsNotEmpty()
  @IsNumber()
  pg_id: number;

  @ApiProperty({ description: 'Room ID' })
  @IsNotEmpty()
  @IsNumber()
  room_id: number;

  @ApiProperty({ description: 'Bed ID' })
  @IsNotEmpty()
  @IsNumber()
  bed_id: number;

  @ApiProperty({ description: 'Amount paid' })
  @IsNotEmpty()
  @IsNumber()
  amount_paid: number;

  @ApiProperty({ description: 'Actual rent amount' })
  @IsNotEmpty()
  @IsNumber()
  actual_rent_amount: number;

  @ApiProperty({ description: 'Payment date', required: false })
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiProperty({ description: 'Payment method', enum: PaymentMethod })
  @IsNotEmpty()
  @IsEnum(PaymentMethod)
  payment_method: PaymentMethod;

  @ApiProperty({ description: 'Payment status', enum: PaymentStatus })
  @IsNotEmpty()
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @ApiProperty({ description: 'Rent cycle ID (preferred)', required: false })
  @IsOptional()
  @IsNumber()
  cycle_id?: number;

  @ApiProperty({ description: 'Current bill amount', required: false })
  @IsOptional()
  @IsNumber()
  current_bill?: number;

  @ApiProperty({ description: 'Current bill ID', required: false })
  @IsOptional()
  @IsNumber()
  current_bill_id?: number;

  @ApiProperty({ description: 'Remarks', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}
