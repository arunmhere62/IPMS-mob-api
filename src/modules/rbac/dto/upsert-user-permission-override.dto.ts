import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export enum UserPermissionOverrideEffect {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
}

export class UpsertUserPermissionOverrideDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  user_id: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  permission_id: number;

  @IsEnum(UserPermissionOverrideEffect)
  effect: UserPermissionOverrideEffect;

  @IsOptional()
  expires_at?: string;
}
