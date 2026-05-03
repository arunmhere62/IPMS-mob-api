import { IsOptional, IsNumber, IsString, IsDateString, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCurrentBillDto {
  @ApiProperty({ description: 'Total bill amount', example: 5000, required: false })
  @IsOptional()
  @IsNumber()
  bill_amount?: number;

  @ApiProperty({
    description: 'Bill date (represents the month for which bill is applicable)',
    example: '2024-01-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  bill_date?: string;

  @ApiProperty({ description: 'Remarks', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}
