import { IsArray, IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AddCommentDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ type: [String], description: 'Array of image URLs' })
  @IsArray()
  @IsUrl({}, { each: true })
  @IsOptional()
  attachments?: string[];
}
