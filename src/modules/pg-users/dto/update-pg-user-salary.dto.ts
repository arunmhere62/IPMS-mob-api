import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

export class UpdatePgUserSalaryDto {
  @ApiProperty({ description: 'Monthly salary amount for this employee in this PG' })
  @IsNumber()
  @Min(0)
  monthly_salary_amount: number;
}
