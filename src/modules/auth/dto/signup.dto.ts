import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsNotEmpty, IsOptional, IsInt, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'My PG Organization', description: 'Organization name' })
  @IsString()
  @IsNotEmpty()
  organizationName: string;

  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+919876543210', description: 'User phone number with country code (e.g., +91 for India)' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'john@example.com', description: 'User email address', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'SecurePass123!', description: 'User password (min 6 characters)', required: false })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: 'Green Valley PG', description: 'PG location name' })
  @IsString()
  @IsNotEmpty()
  pgName: string;

  @ApiProperty({ example: 'CALENDAR', description: 'Rent cycle type (CALENDAR or MIDMONTH)', required: false })
  @IsString()
  @IsOptional()
  rentCycleType?: string;

  @ApiProperty({ example: 1, description: 'Rent cycle start day (1-31)', required: false })
  @IsInt()
  @IsOptional()
  rentCycleStart?: number;

  @ApiProperty({ example: 30, description: 'Rent cycle end day (1-31)', required: false })
  @IsInt()
  @IsOptional()
  rentCycleEnd?: number;

}
