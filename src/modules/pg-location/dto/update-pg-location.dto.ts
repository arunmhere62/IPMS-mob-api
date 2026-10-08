import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsArray, IsEnum, Matches, Min, Max } from 'class-validator';

export class UpdatePgLocationDto {
  @ApiProperty({ example: 'Green Valley PG', description: 'PG location name', required: false })
  @IsString()
  @IsOptional()
  locationName?: string;

  @ApiProperty({ example: '123 Main Street, City', description: 'PG address', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: '560001', description: 'Six-digit Indian PIN code', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^[1-9]\d{5}$/)
  pincode?: string;

  @ApiProperty({ example: 1, description: 'State ID', required: false })
  @IsInt()
  @IsOptional()
  stateId?: number;

  @ApiProperty({ example: 1, description: 'City ID', required: false })
  @IsInt()
  @IsOptional()
  cityId?: number;

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
    example: 'ACTIVE', 
    description: 'PG location status',
    enum: ['ACTIVE', 'INACTIVE'],
    required: false 
  })
  @IsEnum(['ACTIVE', 'INACTIVE'])
  @IsOptional()
  status?: 'ACTIVE' | 'INACTIVE';

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
