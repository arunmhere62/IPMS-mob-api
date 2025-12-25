import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RevokeLegalAcceptanceDto {
  @ApiPropertyOptional({ description: 'Reason for revocation', example: 'User requested withdrawal of consent' })
  @IsOptional()
  @IsString()
  reason?: string;
}
