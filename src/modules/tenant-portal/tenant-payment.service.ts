import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { rent_payments_payment_method, tenant_payment_submissions_payment_method } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';

export interface SubmitPaymentProofDto {
  rent_payment_id?: number; // Optional — if not provided, cycle_id is used to create a rent_payment row
  paid_amount: number;
  paid_date: string; // YYYY-MM-DD
  transaction_ref?: string;
  payment_method?: string; // UPI | GPAY | PHONEPE | CASH | BANK_TRANSFER | OTHER
  payment_screenshot_url?: string;
  tenant_notes?: string;
  // Used when no rent_payment row exists yet (unpaid cycle)
  cycle_id?: number;
  cycle_start?: string;
  cycle_end?: string;
}

@Injectable()
export class TenantPaymentService {
  private readonly logger = new Logger(TenantPaymentService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  /**
   * Get the owner's payment config for the tenant's PG.
   * Resolves SPECIFIC_PG first, falls back to ALL_PG.
   * Returns null if no config exists.
   */
  async getPaymentConfig(tenantId: number) {
    // Get the tenant's current PG
    const tenant = await this.prisma.tenants.findFirst({
      where: { s_no: tenantId, is_deleted: false },
      select: {
        s_no: true,
        name: true,
        pg_id: true,
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            organization_id: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!tenant.pg_id || !tenant.pg_locations) {
      throw new BadRequestException('Tenant is not assigned to a PG');
    }

    const orgId = tenant.pg_locations.organization_id;
    const pgId = tenant.pg_id;

    // 1. Check for SPECIFIC_PG config
    let config = await this.prisma.owner_payment_configs.findFirst({
      where: {
        organization_id: orgId,
        scope_type: 'SPECIFIC_PG',
        pg_id: pgId,
        is_active: true,
      },
    });

    // 2. Fall back to ALL_PG config
    if (!config) {
      config = await this.prisma.owner_payment_configs.findFirst({
        where: {
          organization_id: orgId,
          scope_type: 'ALL_PG',
          pg_id: null,
          is_active: true,
        },
      });
    }

    if (!config) {
      return ResponseUtil.success(
        {
          has_payment_config: false,
          config: null,
          pg_name: tenant.pg_locations.location_name,
        },
        'No payment config found. Please contact your PG owner for payment details.',
      );
    }

    return ResponseUtil.success({
      has_payment_config: true,
      config: {
        upi_id: config.upi_id,
        upi_qr_image_url: config.upi_qr_image_url,
        account_holder_name: config.account_holder_name,
        bank_name: config.bank_name,
        account_number: config.account_number,
        ifsc_code: config.ifsc_code,
        payment_instructions: config.payment_instructions,
      },
      pg_name: tenant.pg_locations.location_name,
    });
  }

  /**
   * Get all payment submissions for this tenant.
   */
  async getMySubmissions(tenantId: number, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.tenant_payment_submissions.findMany({
        where: { tenant_id: tenantId },
        skip,
        take: limit,
        orderBy: { submitted_at: 'desc' },
        include: {
          rent_payments_tenant_payment_submissions_rent_payment_idTorent_payments: {
            select: {
              s_no: true,
              amount_paid: true,
              actual_rent_amount: true,
              status: true,
              payment_method: true,
              cycle_id: true,
            },
          },
          pg_locations: {
            select: { s_no: true, location_name: true },
          },
        },
      }),
      this.prisma.tenant_payment_submissions.count({
        where: { tenant_id: tenantId },
      }),
    ]);

    return ResponseUtil.paginated(items, total, page, limit, 'Your payment submissions');
  }

  /**
   * Submit a payment proof ("I Paid" flow).
   *
   * Validation:
   * - The rent_payment must exist and belong to this tenant
   * - The rent_payment must be in PENDING or PARTIAL status
   * - There must not be an existing SUBMITTED submission for this rent_payment
   * - The paid_amount must be > 0
   *
   * Side effects:
   * - Creates a tenant_payment_submissions record
   * - Sets rent_payment.active_submission_id to the new submission
   * - Snapshots the owner's current payment config
   */
  async submitPaymentProof(tenantId: number, dto: SubmitPaymentProofDto) {
    // 4. Validate paid_amount
    const paidAmount = Number(dto.paid_amount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      throw new BadRequestException('Paid amount must be greater than 0');
    }

    // 5. Validate paid_date
    const paidDate = new Date(dto.paid_date);
    if (isNaN(paidDate.getTime())) {
      throw new BadRequestException('Invalid paid_date format. Use YYYY-MM-DD.');
    }

    let rentPaymentId: number;
    let pgId: number;
    let orgId: number;

    if (dto.rent_payment_id && dto.rent_payment_id > 0) {
      // ── Existing rent_payment row ──
      const rentPayment = await this.prisma.rent_payments.findFirst({
        where: {
          s_no: dto.rent_payment_id,
          tenant_id: tenantId,
          is_deleted: false,
          status: { not: 'VOIDED' },
        },
        include: {
          tenants: {
            select: { pg_id: true, pg_locations: { select: { organization_id: true } } },
          },
        },
      });

      if (!rentPayment) {
        throw new NotFoundException('Rent payment not found');
      }

      // Check rent payment status — only PENDING or PARTIAL can have submissions
      if (rentPayment.status !== 'PENDING' && rentPayment.status !== 'PARTIAL') {
        throw new BadRequestException(
          `Cannot submit payment proof for a rent payment with status ${rentPayment.status}. Only PENDING or PARTIAL payments can be submitted.`,
        );
      }

      // Check for existing SUBMITTED submission
      if (rentPayment.active_submission_id) {
        const existingSubmission = await this.prisma.tenant_payment_submissions.findUnique({
          where: { s_no: rentPayment.active_submission_id },
        });
        if (existingSubmission && existingSubmission.status === 'SUBMITTED') {
          throw new BadRequestException(
            'You already have a pending submission for this payment. Please wait for the PG owner to verify it.',
          );
        }
      }

      rentPaymentId = rentPayment.s_no;
      pgId = rentPayment.tenants?.pg_id;
      orgId = rentPayment.tenants?.pg_locations?.organization_id;
    } else if (dto.cycle_id) {
      // ── No rent_payment row yet — create one from the cycle ──
      const tenant = await this.prisma.tenants.findFirst({
        where: { s_no: tenantId, is_deleted: false },
        select: {
          s_no: true,
          pg_id: true,
          room_id: true,
          bed_id: true,
          pg_locations: { select: { organization_id: true } },
          tenant_allocations: {
            where: { effective_to: null },
            select: { bed_price_snapshot: true },
            orderBy: { effective_from: 'desc' },
            take: 1,
          },
        },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      if (!tenant.pg_id || !tenant.pg_locations?.organization_id) {
        throw new BadRequestException('Tenant is not assigned to a PG');
      }

      // Verify the cycle belongs to this tenant's PG
      const cycle = await this.prisma.tenant_rent_cycles.findFirst({
        where: { s_no: dto.cycle_id },
      });
      if (!cycle) {
        throw new NotFoundException('Rent cycle not found');
      }

      // Check if a rent_payment already exists for this cycle (avoid duplicates)
      // Exclude VOIDED and deleted payments — those are no longer active
      const existingPayment = await this.prisma.rent_payments.findFirst({
        where: {
          tenant_id: tenantId,
          cycle_id: dto.cycle_id,
          is_deleted: false,
          status: { not: 'VOIDED' },
        },
      });
      if (existingPayment) {
        // A row already exists — use it instead of creating a duplicate
        rentPaymentId = existingPayment.s_no;
        if (existingPayment.status !== 'PENDING' && existingPayment.status !== 'PARTIAL') {
          throw new BadRequestException(
            `Cannot submit payment proof for a rent payment with status ${existingPayment.status}.`,
          );
        }
      } else {
        // Create a new PENDING rent_payment row for this cycle
        const bedPrice = tenant.tenant_allocations?.[0]?.bed_price_snapshot;
        const newPayment = await this.prisma.rent_payments.create({
          data: {
            tenant_id: tenantId,
            pg_id: tenant.pg_id,
            room_id: tenant.room_id,
            bed_id: tenant.bed_id,
            cycle_id: dto.cycle_id,
            payment_date: new Date(),
            amount_paid: 0,
            // actual_rent_amount = full expected rent for this cycle (NOT the partial amount)
            // This is used by the verification logic to determine PAID vs PARTIAL
            actual_rent_amount: bedPrice ? Number(bedPrice) : paidAmount,
            payment_method: (dto.payment_method || 'UPI') as rent_payments_payment_method,
            status: 'PENDING',
          },
        });
        rentPaymentId = newPayment.s_no;
      }

      pgId = tenant.pg_id;
      orgId = tenant.pg_locations.organization_id;
    } else {
      throw new BadRequestException('Either rent_payment_id or cycle_id is required');
    }

    if (!pgId || !orgId) {
      throw new BadRequestException('Tenant is not assigned to a PG');
    }

    // 7. Resolve the owner's current payment config and snapshot it
    let configSnapshot: {
      upi_id: string;
      account_holder_name: string | null;
      bank_name: string | null;
      account_number: string | null;
      ifsc_code: string | null;
      payment_instructions: string | null;
    } | null = null;
    let paymentConfig = await this.prisma.owner_payment_configs.findFirst({
      where: {
        organization_id: orgId,
        scope_type: 'SPECIFIC_PG',
        pg_id: pgId,
        is_active: true,
      },
    });

    if (!paymentConfig) {
      paymentConfig = await this.prisma.owner_payment_configs.findFirst({
        where: {
          organization_id: orgId,
          scope_type: 'ALL_PG',
          pg_id: null,
          is_active: true,
        },
      });
    }

    if (paymentConfig) {
      configSnapshot = {
        upi_id: paymentConfig.upi_id,
        account_holder_name: paymentConfig.account_holder_name,
        bank_name: paymentConfig.bank_name,
        account_number: paymentConfig.account_number,
        ifsc_code: paymentConfig.ifsc_code,
        payment_instructions: paymentConfig.payment_instructions,
      };
    }

    // 8. Create the submission in a transaction
    const submission = await this.prisma.$transaction(async (tx) => {
      // Create the submission record
      const newSubmission = await tx.tenant_payment_submissions.create({
        data: {
          rent_payment_id: rentPaymentId,
          tenant_id: tenantId,
          pg_id: pgId,
          organization_id: orgId,
          paid_amount: paidAmount,
          paid_date: paidDate,
          transaction_ref: dto.transaction_ref || null,
          payment_method: (dto.payment_method || 'UPI') as tenant_payment_submissions_payment_method,
          payment_screenshot_url: dto.payment_screenshot_url || null,
          tenant_notes: dto.tenant_notes || null,
          payment_config_snapshot: configSnapshot,
          status: 'SUBMITTED',
        },
      });

      // Link the submission to the rent payment
      await tx.rent_payments.update({
        where: { s_no: rentPaymentId },
        data: { active_submission_id: newSubmission.s_no },
      });

      return newSubmission;
    });

    this.logger.log(
      `Payment proof submitted: tenant #${tenantId}, rent_payment #${rentPaymentId}, submission #${submission.s_no}`,
    );

    // ─── Send push notification to all admins (SUPER_ADMIN + ADMIN) of this org ───
    try {
      const tenant = await this.prisma.tenants.findFirst({
        where: { s_no: tenantId },
        select: { s_no: true, name: true, phone_no: true },
      });
      const pg = await this.prisma.pg_locations.findFirst({
        where: { s_no: pgId },
        select: { location_name: true },
      });
      const tenantName = tenant?.name || 'A tenant';
      const pgName = pg?.location_name || 'a PG';
      const amount = Number(paidAmount);

      await this.notificationService.sendToOrgAdmins(orgId, {
        title: '💰 New Payment Submission',
        body: `${tenantName} submitted a payment of ₹${amount.toLocaleString('en-IN')} for ${pgName}. Please verify it.`,
        type: 'PAYMENT_SUBMISSION',
        data: {
          submission_id: String(submission.s_no),
          rent_payment_id: String(rentPaymentId),
          tenant_id: String(tenantId),
          tenant_name: tenantName,
          amount: String(amount),
          pg_id: String(pgId),
          pg_name: pgName,
          screen: 'PaymentVerification',
        },
      }, pgId);

      this.logger.log(`✅ Payment submission notification sent to org #${orgId} admins`);
    } catch (err) {
      this.logger.error(`❌ Failed to send payment submission notification to admins: ${err}`);
    }

    return ResponseUtil.created(
      submission,
      'Payment proof submitted successfully. Waiting for PG owner verification.',
    );
  }
}
