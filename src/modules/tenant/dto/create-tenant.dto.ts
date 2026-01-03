import { IsString, IsEmail, IsOptional, IsInt, IsDateString, IsEnum } from 'class-validator';
import { tenants_status, Prisma } from '@prisma/client';

export class CreateTenantDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  phone_no?: string;

  @IsOptional()
  @IsString()
  whatsapp_number?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsInt()
  pg_id: number;

  @IsOptional()
  @IsInt()
  room_id?: number;

  @IsOptional()
  @IsInt()
  bed_id?: number;

  @IsDateString()
  check_in_date: string;

  @IsOptional()
  @IsDateString()
  check_out_date?: string;

  @IsOptional()
  @IsEnum(tenants_status)
  status?: tenants_status;

  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  tenant_address?: string;

  @IsOptional()
  @IsInt()
  city_id?: number;

  @IsOptional()
  @IsInt()
  state_id?: number;

  @IsOptional()
  images?: Prisma.InputJsonValue;

  @IsOptional()
  proof_documents?: Prisma.InputJsonValue;
}
