import { IsInt, IsNumber, IsOptional, IsString, Min, IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Prisma } from '@prisma/client';

export class BulkBedItemDto {
  @ApiProperty({ description: 'Bed number (e.g., BED1, BED2)' })
  @IsString()
  bed_no: string;

  @ApiProperty({ description: 'Bed price per month' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  bed_price: number;

  @ApiProperty({ description: 'Bed images (optional)', required: false })
  @IsOptional()
  images?: Prisma.InputJsonValue;
}

export class BulkCreateBedDto {
  @ApiProperty({ description: 'Room ID' })
  @IsInt()
  room_id: number;

  @ApiProperty({ description: 'PG Location ID' })
  @IsOptional()
  @IsInt()
  pg_id?: number;

  @ApiProperty({ description: 'Array of beds to create (1-20)', type: [BulkBedItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Type(() => BulkBedItemDto)
  beds: BulkBedItemDto[];
}
