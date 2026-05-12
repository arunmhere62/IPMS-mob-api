import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TenantTicketCategory {
  MAINTENANCE = 'MAINTENANCE',
  COMPLAINT = 'COMPLAINT',
  REQUEST = 'REQUEST',
  OTHER = 'OTHER',
}

export enum TenantTicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export class CreateTicketDto {
  @ApiProperty({ enum: TenantTicketCategory })
  @IsEnum(TenantTicketCategory)
  category: TenantTicketCategory;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: TenantTicketPriority })
  @IsEnum(TenantTicketPriority)
  @IsOptional()
  priority?: TenantTicketPriority;
}
