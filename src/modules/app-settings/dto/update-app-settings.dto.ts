import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAppSettingsDto {
  @IsOptional()
  @IsBoolean()
  is_maintenance_mode?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  maintenance_message?: string;

  @IsOptional()
  @IsBoolean()
  is_registration_open?: boolean;

  @IsOptional()
  @IsBoolean()
  force_update_android?: boolean;

  @IsOptional()
  @IsBoolean()
  force_update_ios?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  android_store_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ios_store_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  current_version_android?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  current_version_ios?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  minimum_version_android?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  minimum_version_ios?: string;

  @IsOptional()
  @IsInt()
  max_login_attempts?: number;

  @IsOptional()
  @IsInt()
  otp_expiry_seconds?: number;

  @IsOptional()
  @IsInt()
  otp_resend_cooldown_seconds?: number;

  @IsOptional()
  @IsBoolean()
  payment_gateway_enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  announcement_title?: string;

  @IsOptional()
  @IsString()
  announcement_message?: string;

  @IsOptional()
  @IsBoolean()
  show_announcement?: boolean;

  @IsOptional()
  announcement_start_date?: Date;

  @IsOptional()
  announcement_end_date?: Date;
}
