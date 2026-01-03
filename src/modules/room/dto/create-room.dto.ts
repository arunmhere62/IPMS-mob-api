import { IsString, IsInt, IsOptional, IsNumber } from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateRoomDto {
  @IsInt()
  pg_id: number;

  @IsString()
  room_no: string;

  @IsOptional()
  @IsNumber()
  rent_price?: number;

  @IsOptional()
  images?: Prisma.InputJsonValue;
}
