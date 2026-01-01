import { CommonHeaders, CommonHeadersDecorator } from '../../../common/decorators/common-headers.decorator';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PendingPaymentService } from './pending-payment.service';

@ApiTags('pending-payments')
@Controller('tenants/pending-payments')
export class PendingPaymentController {
  constructor(private readonly pendingPaymentService: PendingPaymentService) {}

  /**
   * Get pending payment details for a specific tenant
   * GET /api/v1/tenants/pending-payments/:id
   * Headers: x-pg-location-id, x-organization-id, x-user-id
   */
  @Get(':id')
  async getTenantPendingPayment(@Param('id') id: string) {
    const tenantId = parseInt(id, 10);
    return this.pendingPaymentService.calculateTenantPendingPayment(tenantId);
  }

  /**
   * Get all tenants with pending payments
   * GET /api/v1/tenants/pending-payments
   * Headers: x-pg-location-id, x-organization-id, x-user-id
   * Query: pg_id (optional)
   */
  @Get()
  async getAllPendingPayments(
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Query('pg_id') pgId?: string,
  ) {
    const pgLocationId = pgId
      ? parseInt(pgId, 10)
      : headers.pg_id;

    const pendingPayments = await this.pendingPaymentService.getAllPendingPayments(
      pgLocationId,
    );

    return {
      success: true,
      data: pendingPayments,
      summary: {
        total_tenants: pendingPayments.length,
        total_pending_amount: pendingPayments.reduce(
          (sum, p) => sum + p.total_pending,
          0,
        ),
        overdue_tenants: pendingPayments.filter((p) => p.payment_status === 'OVERDUE')
          .length,
        partial_payment_tenants: pendingPayments.filter(
          (p) => p.payment_status === 'PARTIAL',
        ).length,
      },
    };
  }

  /**
   * Get tenants with payment due tomorrow
   * GET /api/v1/tenants/pending-payments/due-tomorrow
   * Headers: x-pg-location-id, x-organization-id, x-user-id
   */
  @Get('due-tomorrow/list')
  async getPaymentsDueTomorrow(
    @CommonHeadersDecorator() headers: CommonHeaders,
    @Query('pg_id') pgId?: string,
  ) {
    const pgLocationId = pgId
      ? parseInt(pgId, 10)
      : headers.pg_id;

    const dueTomorrow = await this.pendingPaymentService.getTenantsWithPaymentDueTomorrow(
      pgLocationId,
    );

    return {
      success: true,
      data: dueTomorrow,
      count: dueTomorrow.length,
    };
  }
}
