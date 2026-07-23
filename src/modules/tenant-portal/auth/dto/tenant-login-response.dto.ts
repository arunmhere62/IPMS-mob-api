import { ApiProperty } from '@nestjs/swagger';

export class TenantLoginResponseDto {
  @ApiProperty({ description: 'JWT access token for tenant' })
  accessToken: string;

  @ApiProperty({ description: 'JWT refresh token for tenant' })
  refreshToken?: string;

  @ApiProperty({ description: 'Tenant profile data' })
  tenant: {
    s_no: number;
    name: string;
    phone: string;
    email?: string;
    pg_id: number;
    room_id?: number;
    bed_id?: number;
    status: string;
  };
}

export class TenantAuthResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty({ required: false })
  data?: unknown;
}
