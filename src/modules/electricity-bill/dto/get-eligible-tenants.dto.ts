import { IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetEligibleTenantsDto {
  @IsInt()
  @Type(() => Number)
  room_id: number;

  @IsDateString()
  bill_period_start: string;

  @IsDateString()
  bill_period_end: string;
}
