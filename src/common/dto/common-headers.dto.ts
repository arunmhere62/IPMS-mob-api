import { IsOptional } from 'class-validator';

export class CommonHeadersDto {
  @IsOptional()
  pg_id?: number;

  @IsOptional()
  organization_id?: number;

  @IsOptional()
  user_id?: number;
}
