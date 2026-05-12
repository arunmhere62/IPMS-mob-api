import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum TenantTicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TenantTicketStatus })
  @IsEnum(TenantTicketStatus)
  status: TenantTicketStatus;
}
