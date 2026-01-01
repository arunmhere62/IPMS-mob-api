import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class GeneratePayrollRunDto {
  @ApiProperty({ description: 'Month to generate payroll for (normalized to YYYY-MM-01)', example: '2026-01-01' })
  @IsDateString()
  month: string;
}
