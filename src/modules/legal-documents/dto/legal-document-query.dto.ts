import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class LegalDocumentQueryDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 10 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  limit?: number = 10;

  @ApiPropertyOptional({ description: 'Filter by type', example: 'PRIVACY_POLICY' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by is_active', example: true })
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Filter by organization_id', example: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  organization_id?: number;

  @ApiPropertyOptional({ description: 'If true, return only required docs', example: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  required_only?: boolean = false;
}
