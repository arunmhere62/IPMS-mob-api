import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLegalDocumentDto {
  @ApiProperty({ description: 'Document type (e.g. PRIVACY_POLICY, TERMS, INVOICE_TERMS)', example: 'PRIVACY_POLICY' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  type: string;

  @ApiProperty({ description: 'Document title', example: 'Privacy Policy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: 'Document version', example: '1.0' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  version: string;

  @ApiProperty({ description: 'Public URL to the document (pdf/html)', example: 'https://example.com/privacy-policy-v1.pdf' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  url: string;

  @ApiPropertyOptional({ description: 'Whether the document is active', example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Whether acceptance is required', example: true })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ description: 'Effective date (ISO string)', example: '2025-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  effective_date?: string;

  @ApiPropertyOptional({ description: 'Expiry date (ISO string) or null', example: null })
  @IsOptional()
  @IsString()
  expiry_date?: string | null;

  @ApiPropertyOptional({ description: 'Organization ID (optional). If omitted, will use X-Organization-Id if present', example: 1 })
  @IsOptional()
  organization_id?: number;
}
