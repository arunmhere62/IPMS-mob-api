import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AcceptLegalDocumentDto {
  @ApiPropertyOptional({ description: 'Context where acceptance happened', example: 'SIGNUP' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  acceptance_context?: string;

  @ApiPropertyOptional({ description: 'IP address', example: '127.0.0.1' })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  ip_address?: string;

  @ApiPropertyOptional({ description: 'User agent', example: 'Mozilla/5.0 ...' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  user_agent?: string;
}
