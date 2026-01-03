import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';

export class CreateRoleDto {
  @ApiProperty({
    description: 'Role name',
    example: 'Manager',
  })
  @IsString()
  @IsNotEmpty()
  role_name: string;

  @ApiPropertyOptional({
    description: 'Role permissions as JSON object',
    example: {
      "pgLocationCreate": true,
      "pgLocationEdit": true,
      "pgLocationDelete": false,
      "tenantCreate": true,
      "tenantEdit": true
    },
  })
  @IsOptional()
  permissions?: Prisma.InputJsonValue;


  @ApiPropertyOptional({
    description: 'Role status',
    example: 'ACTIVE',
    enum: ['ACTIVE', 'INACTIVE'],
  })
  @IsOptional()
  @IsString()
  status?: 'ACTIVE' | 'INACTIVE';
}
