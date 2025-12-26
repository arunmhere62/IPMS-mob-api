import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class RemoveUserPermissionOverrideDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  user_id: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  permission_id: number;
}
