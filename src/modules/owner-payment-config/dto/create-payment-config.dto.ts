import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PaymentConfigScopeType {
  ALL_PG = 'ALL_PG',
  SPECIFIC_PG = 'SPECIFIC_PG',
}

export class CreatePaymentConfigDto {
  @ApiProperty({ enum: PaymentConfigScopeType, description: 'ALL_PG or SPECIFIC_PG' })
  @IsEnum(PaymentConfigScopeType)
  scope_type: PaymentConfigScopeType;

  @ApiPropertyOptional({ description: 'Required when scope_type is SPECIFIC_PG' })
  @IsOptional()
  @IsInt()
  pg_id?: number;

  @ApiProperty({ example: 'owner@upi', description: 'UPI ID / VPA' })
  @IsString()
  @MaxLength(100)
  upi_id: string;

  @ApiPropertyOptional({ description: 'URL to QR code image' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  upi_qr_image_url?: string;

  @ApiPropertyOptional({ description: 'Name of the account holder' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  account_holder_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bank_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  account_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ifsc_code?: string;

  @ApiPropertyOptional({ description: 'Instructions shown to tenant' })
  @IsOptional()
  @IsString()
  payment_instructions?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdatePaymentConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  upi_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  upi_qr_image_url?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  account_holder_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bank_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  account_number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  ifsc_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payment_instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
