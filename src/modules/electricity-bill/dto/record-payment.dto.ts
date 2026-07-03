import { IsNotEmpty, IsNumber, IsString, IsOptional, IsDateString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RecordPaymentDto {
  @ApiProperty({ description: 'Electricity bill item ID (tenant allocation row)' })
  @IsNotEmpty()
  @IsNumber()
  bill_item_id: number;

  @ApiProperty({ description: 'Tenant ID' })
  @IsNotEmpty()
  @IsNumber()
  tenant_id: number;

  @ApiProperty({ description: 'Payment amount' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ description: 'Payment method' })
  @IsNotEmpty()
  @IsString()
  payment_method: string;

  @ApiProperty({ description: 'Payment date (YYYY-MM-DD)', required: false })
  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @ApiProperty({ description: 'Remarks', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}
