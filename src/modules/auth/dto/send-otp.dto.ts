import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    example: '918248449609',
    description: 'Phone number with country code (without + sign)',
  })
  @IsString()
  // @Matches(/^91[6-9]\d{9}$/, {
  //   message: 'Phone number must be a valid Indian mobile number starting with 91',
  // })
  phone: string;
}
