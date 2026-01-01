import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export enum PaymentMethod {
  GPAY = 'GPAY',
  PHONEPE = 'PHONEPE',
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export class CreatePayrollItemPaymentDto {
  @ApiProperty({ description: 'Amount paid for this employee salary item' })
  @IsNumber()
  @Min(0.01)
  paid_amount: number;

  @ApiProperty({ description: 'Date of payment', example: '2026-01-15' })
  @IsDateString()
  paid_date: string;

  @ApiProperty({ enum: PaymentMethod, required: false, description: 'Payment method' })
  @IsEnum(PaymentMethod)
  @IsOptional()
  payment_method?: PaymentMethod;

  @ApiProperty({ required: false, description: 'Remarks' })
  @IsOptional()
  remarks?: string;
}
