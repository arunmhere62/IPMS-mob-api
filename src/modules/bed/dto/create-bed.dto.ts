import { IsString, IsInt, IsOptional, IsNumber, Min } from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateBedDto {
  @IsInt()
  room_id: number;

  @IsString()
  bed_no: string;

  @IsOptional()
  @IsInt()
  pg_id?: number;

  @IsOptional()
  images?: Prisma.InputJsonValue;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  bed_price: number;
}
