import { IsNotEmpty, IsNumber, IsString, IsOptional, IsEnum, IsDateString, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum AllocationBasis {
  EQUAL = 'EQUAL',
  RENT_CYCLE_DAYS = 'RENT_CYCLE_DAYS',
  CUSTOM = 'CUSTOM',
}

export enum ElectricityBillStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  CANCELLED = 'CANCELLED',
}

export class CustomAllocationItemDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsNotEmpty()
  @IsNumber()
  tenant_id: number;

  @ApiProperty({ description: 'Share amount for this tenant' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  share_amount: number;

  @ApiProperty({ description: 'Share percentage (0-100)' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(100)
  share_percentage: number;
}

export class CreateElectricityBillDto {
  @ApiProperty({ description: 'PG Location ID' })
  @IsNotEmpty()
  @IsNumber()
  pg_id: number;

  @ApiProperty({ description: 'Room ID' })
  @IsNotEmpty()
  @IsNumber()
  room_id: number;

  @ApiProperty({ description: 'Bill period start date (YYYY-MM-DD)' })
  @IsNotEmpty()
  @IsDateString()
  bill_period_start: string;

  @ApiProperty({ description: 'Bill period end date (YYYY-MM-DD)' })
  @IsNotEmpty()
  @IsDateString()
  bill_period_end: string;

  @ApiProperty({ description: 'Total bill amount' })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.01)
  total_amount: number;

  @ApiProperty({ description: 'Units consumed', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  units_consumed?: number;

  @ApiProperty({ description: 'Rate per unit', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rate_per_unit?: number;

  @ApiProperty({ description: 'Previous meter reading', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  meter_reading_start?: number;

  @ApiProperty({ description: 'Current meter reading', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  meter_reading_end?: number;

  @ApiProperty({ description: 'Due date (YYYY-MM-DD)', required: false })
  @IsOptional()
  @IsDateString()
  due_date?: string;

  @ApiProperty({ description: 'Allocation basis', enum: AllocationBasis })
  @IsNotEmpty()
  @IsEnum(AllocationBasis)
  allocation_basis: AllocationBasis;

  @ApiProperty({ description: 'Custom allocation items (required when basis is CUSTOM)', required: false, type: [CustomAllocationItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomAllocationItemDto)
  custom_allocations?: CustomAllocationItemDto[];

  @ApiProperty({ description: 'Notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
