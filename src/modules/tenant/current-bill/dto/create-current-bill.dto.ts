import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCurrentBillDto {
  @ApiProperty({ description: 'Tenant ID', required: false })
  @IsOptional()
  @IsNumber()
  tenant_id?: number;

  @ApiProperty({ description: 'Room ID', required: false })
  @IsOptional()
  @IsNumber()
  room_id?: number;

  @ApiProperty({ description: 'PG Location ID' })
  @IsOptional()
  @IsNumber()
  pg_id?: number;

  @ApiProperty({ description: 'Total bill amount', example: 5000 })
  @IsNotEmpty()
  @IsNumber()
  bill_amount: number;

  @ApiProperty({
    description: 'Bill date (represents the month for which bill is applicable)',
    example: '2024-01-01',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  bill_date?: string;

  @ApiProperty({
    description: 'Whether to split bill equally among all tenants in the room',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  split_equally?: boolean;

  @ApiProperty({ description: 'Remarks', required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}
