import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { CommonHeaders, CommonHeadersDecorator } from '../../common/decorators/common-headers.decorator';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(HeadersValidationGuard, JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Dashboard summary' })
  @ApiResponse({ status: 200, description: 'Dashboard summary fetched successfully' })
  async getSummary(@CommonHeadersDecorator() commonHeaders: CommonHeaders) {
    return this.dashboardService.getDashboardSummary({
      pg_id: commonHeaders.pg_id!,
    });
  }

  @Get('monthly-metrics')
  @RequireHeaders({ pg_id: true })
  @ApiOperation({ summary: 'Dashboard monthly metrics' })
  @ApiResponse({ status: 200, description: 'Dashboard monthly metrics fetched successfully' })
  async getMonthlyMetrics(
    @CommonHeadersDecorator() commonHeaders: CommonHeaders,
    @Query('monthStart') monthStart?: string,
    @Query('monthEnd') monthEnd?: string,
  ) {
    return this.dashboardService.getDashboardMonthlyMetrics({
      pg_id: commonHeaders.pg_id!,
      monthStart,
      monthEnd,
    });
  }
}
