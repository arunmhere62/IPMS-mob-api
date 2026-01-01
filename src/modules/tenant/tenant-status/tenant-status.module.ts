import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';
import { TenantStatusService } from './tenant-status.service';

@Module({
  imports: [PrismaModule, CommonModule],
  providers: [TenantStatusService],
  exports: [TenantStatusService],
})
export class TenantStatusModule {}
