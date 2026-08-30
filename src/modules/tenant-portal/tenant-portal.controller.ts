import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantPortalService } from './tenant-portal.service';
import { TenantPaymentService } from './tenant-payment.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantJwtAuthGuard } from '../auth/guards/tenant-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { TenantHeadersDecorator, TenantHeaders } from '../../common/decorators/tenant-headers.decorator';
import { TenantHeadersValidationGuard } from '../../common/guards/tenant-headers-validation.guard';

@ApiTags('tenant-portal')
@Controller('tenant')
@UseGuards(TenantJwtAuthGuard, TenantHeadersValidationGuard, RolesGuard)
@Roles(UserRole.TENANT)
@ApiBearerAuth()
export class TenantPortalController {
  constructor(
    private readonly tenantPortalService: TenantPortalService,
    private readonly tenantService: TenantService,
    private readonly tenantPaymentService: TenantPaymentService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get tenant profile (basic info only — no payment data)' })
  @ApiResponse({ status: 200, description: 'Tenant profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getProfile(@TenantHeadersDecorator() headers: TenantHeaders) {
    // Slim profile — no payment data. Use /tenant/payments-summary for payments.
    return this.tenantService.findOneProfileOnly(headers.tenant_id);
  }

  @Get('payments-summary')
  @ApiOperation({ summary: 'Get tenant payments summary (rent, advance, refund, cycles, dues)' })
  @ApiResponse({ status: 200, description: 'Payments summary retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async getPaymentsSummary(@TenantHeadersDecorator() headers: TenantHeaders) {
    return this.tenantService.findOnePaymentsSummary(headers.tenant_id);
  }

  @Get('payments')
  @ApiOperation({ summary: 'Get tenant payment history' })
  @ApiResponse({ status: 200, description: 'Payment history retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  async getPayments(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.tenantPortalService.getTenantPayments(headers.tenant_id, page, limit);
  }

  @Get('dues')
  @ApiOperation({ summary: 'Get tenant pending dues' })
  @ApiResponse({ status: 200, description: 'Dues retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  async getDues(@TenantHeadersDecorator() headers: TenantHeaders) {
    return this.tenantPortalService.getTenantDues(headers.tenant_id);
  }

  @Get('ticket-stats')
  @ApiOperation({ summary: 'Get tenant dashboard ticket statistics' })
  @ApiResponse({ status: 200, description: 'Ticket statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  async getTicketStats(@TenantHeadersDecorator() headers: TenantHeaders) {
    return this.tenantPortalService.getTenantTicketDashboardStats({ tenant_id: headers.tenant_id });
  }

  @Patch('expected-vacate-date')
  @ApiOperation({ summary: 'Update tenant expected vacate date' })
  @ApiResponse({ status: 200, description: 'Expected vacate date updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a tenant' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  async updateExpectedVacateDate(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Body() body: { expected_vacate_date: string | null },
  ) {
    return this.tenantService.update(headers.tenant_id, {
      expected_vacate_date: body.expected_vacate_date,
    });
  }

  // ─── Manual Payment Flow ────────────────────────────────────

  @Get('payment-config')
  @ApiOperation({ summary: 'Get PG owner payment config (UPI/QR) for this tenant' })
  @ApiResponse({ status: 200, description: 'Payment config retrieved' })
  async getPaymentConfig(@TenantHeadersDecorator() headers: TenantHeaders) {
    return this.tenantPaymentService.getPaymentConfig(headers.tenant_id);
  }

  @Get('payment-submissions')
  @ApiOperation({ summary: 'Get my payment submissions (I Paid history)' })
  @ApiResponse({ status: 200, description: 'Submissions retrieved' })
  async getMySubmissions(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    return this.tenantPaymentService.getMySubmissions(headers.tenant_id, page, limit);
  }

  @Post('payment-submissions')
  @ApiOperation({ summary: 'Submit payment proof ("I Paid" flow)' })
  @ApiResponse({ status: 201, description: 'Payment proof submitted. Waiting for verification.' })
  @ApiResponse({ status: 400, description: 'Bad request — validation error' })
  @ApiResponse({ status: 404, description: 'Rent payment not found' })
  async submitPaymentProof(
    @TenantHeadersDecorator() headers: TenantHeaders,
    @Body() body: {
      rent_payment_id?: number;
      paid_amount: number;
      paid_date: string;
      transaction_ref?: string;
      payment_method?: string;
      payment_screenshot_url?: string;
      tenant_notes?: string;
      cycle_id?: number;
      cycle_start?: string;
      cycle_end?: string;
    },
  ) {
    return this.tenantPaymentService.submitPaymentProof(headers.tenant_id, body);
  }
}
