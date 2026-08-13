import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ActionType {
  APP_INSTALL = 'APP_INSTALL',
  APP_UPDATE = 'APP_UPDATE',
  APP_OPEN = 'APP_OPEN',
  APP_CLOSE = 'APP_CLOSE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
}

export class LogActivityDto {
  @ApiProperty({ enum: ActionType, description: 'Type of activity event' })
  @IsEnum(ActionType)
  action_type: ActionType;

  @ApiPropertyOptional({ description: 'User ID (for owner app events)' })
  @IsOptional()
  @IsInt()
  user_id?: number;

  @ApiPropertyOptional({ description: 'Tenant ID (for tenant app events)' })
  @IsOptional()
  @IsInt()
  tenant_id?: number;

  @ApiPropertyOptional({ description: 'App version e.g. "1.0.0"', maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  app_version?: string;

  @ApiPropertyOptional({ description: 'OS version e.g. "Android 14"', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  os_version?: string;

  @ApiPropertyOptional({ description: 'Device model e.g. "Samsung Galaxy S21"', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  device_model?: string;

  @ApiPropertyOptional({ description: 'Unique device identifier', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  device_id?: string;

  @ApiPropertyOptional({ description: 'IP address', maxLength: 45 })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  ip_address?: string;

  @ApiPropertyOptional({ description: 'User agent string', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  user_agent?: string;

  @ApiPropertyOptional({ description: 'Additional metadata (JSON)', type: 'object' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
