import { ApiProperty } from '@nestjs/swagger';

export class AuthResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'OTP sent successfully' })
  message: string;

  @ApiProperty({ required: false })
  data?: Record<string, unknown>;
}

export class LoginResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Login successful' })
  message: string;

  @ApiProperty()
  user: {
    s_no: number;
    name: string;
    email: string;
    phone: string;
    role_id: number;
    organization_id: number;
    status: string;
  };

  @ApiProperty({ 
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token'
  })
  access_token: string;

  @ApiProperty({ 
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT refresh token'
  })
  refresh_token: string;

  @ApiProperty({ 
    example: 'Bearer',
    description: 'Token type'
  })
  token_type: string;

  @ApiProperty({ 
    example: 86400,
    description: 'Token expiry time in seconds'
  })
  expires_in: number;
}
