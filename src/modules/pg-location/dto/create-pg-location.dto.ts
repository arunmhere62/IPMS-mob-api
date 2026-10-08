import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsArray, IsEnum, Matches, Min, Max } from 'class-validator';

export class CreatePgLocationDto {
  @ApiProperty({ example: 'Green Valley PG', description: 'PG location name' })
  @IsString()
  @IsNotEmpty()
  locationName: string;

  @ApiProperty({ example: '123 Main Street, City', description: 'PG address' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: '560001', description: 'Six-digit Indian PIN code', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^[1-9]\d{5}$/)
  pincode?: string;

  @ApiProperty({ example: 1, description: 'State ID' })
  @IsInt()
  @IsNotEmpty()
  stateId: number;

  @ApiProperty({ example: 1, description: 'City ID' })
  @IsInt()
  @IsNotEmpty()
  cityId: number;

  @ApiProperty({ 
    example: ['image1.jpg', 'image2.jpg'], 
    description: 'Array of image URLs',
    required: false,
    type: [String]
  })
  @IsArray()
  @IsOptional()
  images?: string[];

  @ApiProperty({ 
    example: 'CALENDAR', 
    description: 'Rent cycle type',
    enum: ['CALENDAR', 'MIDMONTH'],
    required: false
  })
  @IsEnum(['CALENDAR', 'MIDMONTH'])
  @IsOptional()
  rentCycleType?: 'CALENDAR' | 'MIDMONTH';

  @ApiProperty({ 
    example: 1, 
    description: 'Rent cycle start day (1-31)',
    required: false
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(31)
  rentCycleStart?: number;

  @ApiProperty({ 
    example: 30, 
    description: 'Rent cycle end day (1-31)',
    required: false
  })
  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(31)
  rentCycleEnd?: number;

  @ApiProperty({ 
    example: 'COLIVING', 
    description: 'PG type',
    enum: ['COLIVING', 'MENS', 'WOMENS'],
    required: false
  })
  @IsEnum(['COLIVING', 'MENS', 'WOMENS'])
  @IsOptional()
  pgType?: 'COLIVING' | 'MENS' | 'WOMENS';
}
