import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TenantStatusModule } from '../tenant/tenant-status/tenant-status.module';
import { TenantPaymentModule } from '../tenant/tenant-payment/rent-payment.module';
import { TenantRentSummaryService } from '../tenant/tenant-rent-summary.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardTenantStatusService } from './dashboard-tenant-status.service';
import { DashboardMonthlyMetricsService } from './dashboard-monthly-metrics.service';

@Module({
  imports: [PrismaModule, AuthModule, TenantStatusModule, TenantPaymentModule],
  controllers: [DashboardController],
  providers: [DashboardService, TenantRentSummaryService, DashboardTenantStatusService, DashboardMonthlyMetricsService],
  exports: [DashboardService],
})
export class DashboardModule {}
