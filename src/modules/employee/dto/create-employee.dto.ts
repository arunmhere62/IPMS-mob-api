import { IsString, IsEmail, IsOptional, IsInt, IsEnum, IsNotEmpty, Matches, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { users_gender } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'John Doe', description: 'Employee name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'john@example.com', description: 'Employee email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123', description: 'Employee password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: '9876543210', description: 'Phone number (10 digits)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{10}$/, { message: 'Phone number must be 10 digits' })
  phone: string;

  @ApiProperty({ example: 2, description: 'Role ID' })
  @IsInt()
  @IsNotEmpty()
  role_id: number;

  @ApiPropertyOptional({ example: 1, description: 'PG Location ID' })
  @IsOptional()
  @IsInt()
  pg_id?: number;

  @ApiProperty({ example: 'MALE', enum: users_gender, description: 'Gender' })
  @IsEnum(users_gender)
  @IsNotEmpty()
  gender: users_gender;

  @ApiPropertyOptional({ example: '123 Main St', description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 1, description: 'City ID' })
  @IsOptional()
  @IsInt()
  city_id?: number;

  @ApiPropertyOptional({ example: 1, description: 'State ID' })
  @IsOptional()
  @IsInt()
  state_id?: number;

  @ApiPropertyOptional({ example: '560001', description: 'Pincode' })
  @IsOptional()
  @IsString()
  pincode?: string;

  @ApiPropertyOptional({ example: 'India', description: 'Country' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: ['url1', 'url2'], description: 'Proof documents URLs' })
  @IsOptional()
  @IsArray()
  proof_documents?: string[];

  @ApiPropertyOptional({ example: ['url1', 'url2'], description: 'Profile images URLs' })
  @IsOptional()
  @IsArray()
  profile_images?: string[];
}
