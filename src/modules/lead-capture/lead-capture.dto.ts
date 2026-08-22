import { IsString, IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';

export class LeadCaptureDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9]{10}$/, { message: 'Phone must be a 10-digit number' })
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
