import { IsString, IsEmail, IsOptional, IsInt, IsEnum, IsNotEmpty, Matches, IsArray, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { users_gender } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'John Doe', description: 'Employee name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'john@example.com', description: 'Employee email' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'password123', description: 'Employee password' })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: '+919876543210', description: 'Phone number with country code (E.164 format)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'Phone number must include country code (e.g., +919876543210)',
  })
  phone: string;

  @ApiProperty({ example: 2, description: 'Role ID' })
  @IsInt()
  @IsNotEmpty()
  role_id: number;

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
