import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { UpsertUserPermissionOverrideDto } from './upsert-user-permission-override.dto';

export class BulkUpsertUserPermissionOverridesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertUserPermissionOverrideDto)
  overrides: UpsertUserPermissionOverrideDto[];
}
