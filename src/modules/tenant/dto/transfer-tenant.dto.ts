import { IsInt, IsDateString } from 'class-validator';

export class TransferTenantDto {
  @IsInt()
  to_pg_id: number;

  @IsInt()
  to_room_id: number;

  @IsInt()
  to_bed_id: number;

  @IsDateString()
  effective_from: string;
}
