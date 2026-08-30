import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { Prisma, tenant_payment_submissions_status, rent_payments_payment_method } from '@prisma/client';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class PaymentVerificationService {
  private readonly logger = new Logger(PaymentVerificationService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  /**
   * List all submissions for the owner's organization.
   * Filterable by status and pg_id.
   */
  async findAll(
    organizationId: number,
    filters: { status?: string; pg_id?: number; page?: number; limit?: number },
  ) {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.tenant_payment_submissionsWhereInput = {
      organization_id: organizationId,
    };

    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status as tenant_payment_submissions_status;
    }

    if (filters.pg_id) {
      where.pg_id = filters.pg_id;
    }

    const [items, total] = await Promise.all([
      this.prisma.tenant_payment_submissions.findMany({
        where,
        skip,
        take: limit,
        orderBy: { submitted_at: 'desc' },
        include: {
          tenants: {
            select: { s_no: true, name: true, phone_no: true, email: true },
          },
          pg_locations: {
            select: { s_no: true, location_name: true },
          },
          rent_payments_tenant_payment_submissions_rent_payment_idTorent_payments: {
            select: {
              s_no: true,
              amount_paid: true,
              actual_rent_amount: true,
              status: true,
              payment_method: true,
              remarks: true,
              rooms: { select: { s_no: true, room_no: true } },
              beds: { select: { s_no: true, bed_no: true } },
            },
          },
        },
      }),
      this.prisma.tenant_payment_submissions.count({ where }),
    ]);

    return ResponseUtil.paginated(items, total, page, limit, 'Submissions retrieved');
  }

  /**
   * Get a single submission with full details.
   */
  async findOne(id: number, organizationId: number) {
    const submission = await this.prisma.tenant_payment_submissions.findFirst({
      where: { s_no: id, organization_id: organizationId },
      include: {
        tenants: {
          select: { s_no: true, name: true, phone_no: true, email: true },
        },
        pg_locations: {
          select: { s_no: true, location_name: true, address: true },
        },
        rent_payments_tenant_payment_submissions_rent_payment_idTorent_payments: {
          select: {
            s_no: true,
            amount_paid: true,
            actual_rent_amount: true,
            status: true,
            payment_method: true,
            remarks: true,
            payment_date: true,
            rooms: { select: { s_no: true, room_no: true } },
            beds: { select: { s_no: true, bed_no: true } },
          },
        },
        users: {
          select: { s_no: true, name: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    return ResponseUtil.success(submission);
  }

  /**
   * Verify a payment submission.
   * - Sets submission.status = VERIFIED
   * - Accumulates amount_paid on the rent_payment (supports partial payments)
   * - Sets rent_payment.status = PAID (fully paid) or PARTIAL (still has remaining due)
   * - Sets rent_payment.active_submission_id = null (no longer pending)
   * - Records who verified it
   */
  async verify(id: number, organizationId: number, verifiedByUserId: number, notes?: string) {
    const submission = await this.prisma.tenant_payment_submissions.findFirst({
      where: { s_no: id, organization_id: organizationId },
      include: {
        rent_payments_tenant_payment_submissions_rent_payment_idTorent_payments: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Cannot verify a submission with status ${submission.status}. Only SUBMITTED submissions can be verified.`,
      );
    }

    const rentPayment = submission.rent_payments_tenant_payment_submissions_rent_payment_idTorent_payments;
    if (!rentPayment) {
      throw new BadRequestException('Linked rent payment not found');
    }

    // Calculate the new total paid amount (accumulate, don't overwrite)
    const previousPaid = Number(rentPayment.amount_paid || 0);
    const submissionAmount = Number(submission.paid_amount || 0);
    const newTotalPaid = previousPaid + submissionAmount;
    const expectedRent = Number(rentPayment.actual_rent_amount || 0);

    // Determine new status: PAID if fully settled, PARTIAL if still has remaining due
    const newStatus = newTotalPaid >= expectedRent && expectedRent > 0 ? 'PAID' : 'PARTIAL';
    const remainingDue = Math.max(0, expectedRent - newTotalPaid);

    // Use a transaction to ensure both records are updated atomically
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update the submission
      const updatedSubmission = await tx.tenant_payment_submissions.update({
        where: { s_no: id },
        data: {
          status: 'VERIFIED',
          verified_by: verifiedByUserId,
          verified_at: new Date(),
          rejection_reason: null,
        },
      });

      // 2. Update the rent payment — accumulate amount_paid, set PAID or PARTIAL
      const updatedRentPayment = await tx.rent_payments.update({
        where: { s_no: submission.rent_payment_id },
        data: {
          status: newStatus,
          // Update payment_method to what the tenant actually used
          payment_method: submission.payment_method as rent_payments_payment_method,
          // Accumulate amount_paid (previous partial + this submission)
          amount_paid: newTotalPaid,
          // Clear the active submission pointer
          active_submission_id: null,
          // Add remarks if notes provided
          ...(notes ? { remarks: notes } : {}),
        },
      });

      return { submission: updatedSubmission, rentPayment: updatedRentPayment };
    });

    this.logger.log(
      `Payment verified: submission #${id}, rent_payment #${submission.rent_payment_id}, ` +
      `amount=${submissionAmount}, totalPaid=${newTotalPaid}, expected=${expectedRent}, ` +
      `status=${newStatus}, remainingDue=${remainingDue}, by user #${verifiedByUserId}`,
    );

    // ─── Send push notification to the tenant ───
    try {
      const pg = await this.prisma.pg_locations.findFirst({
        where: { s_no: submission.pg_id },
        select: { location_name: true },
      });
      const pgName = pg?.location_name || 'your PG';
      const amount = Number(submission.paid_amount || 0);

      // Different notification for full vs partial verification
      const isFullPayment = newStatus === 'PAID';
      const notifTitle = isFullPayment ? '✅ Payment Verified' : '✅ Partial Payment Verified';
      const notifBody = isFullPayment
        ? `Your rent payment of ₹${amount.toLocaleString('en-IN')} for ${pgName} has been verified by the owner. Thank you!`
        : `Your partial payment of ₹${amount.toLocaleString('en-IN')} for ${pgName} has been verified. Remaining due: ₹${remainingDue.toLocaleString('en-IN')}.`;

      await this.notificationService.sendToTenant(submission.tenant_id, {
        title: notifTitle,
        body: notifBody,
        type: 'PAYMENT_CONFIRMATION',
        data: {
          submission_id: String(id),
          rent_payment_id: String(submission.rent_payment_id),
          amount: String(amount),
          total_paid: String(newTotalPaid),
          remaining_due: String(remainingDue),
          payment_status: newStatus,
          pg_id: String(submission.pg_id),
          screen: 'TenantPayments',
        },
      });
      this.logger.log(`✅ Verification notification sent to tenant #${submission.tenant_id}`);
    } catch (err) {
      this.logger.error(`❌ Failed to send verification notification: ${err}`);
    }

    const message = newStatus === 'PAID'
      ? 'Payment verified successfully. Rent payment marked as PAID.'
      : `Partial payment verified. ₹${remainingDue.toLocaleString('en-IN')} remaining due. Rent payment marked as PARTIAL.`;

    return ResponseUtil.success(
      result,
      message,
    );
  }

  /**
   * Reject a payment submission.
   * - Sets submission.status = REJECTED
   * - Sets rent_payment.active_submission_id = null (tenant can resubmit)
   * - Records rejection reason
   */
  async reject(id: number, organizationId: number, verifiedByUserId: number, rejectionReason: string) {
    const submission = await this.prisma.tenant_payment_submissions.findFirst({
      where: { s_no: id, organization_id: organizationId },
      include: {
        rent_payments_tenant_payment_submissions_rent_payment_idTorent_payments: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Cannot reject a submission with status ${submission.status}. Only SUBMITTED submissions can be rejected.`,
      );
    }

    if (!rejectionReason || rejectionReason.trim() === '') {
      throw new BadRequestException('Rejection reason is required');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Update the submission
      const updatedSubmission = await tx.tenant_payment_submissions.update({
        where: { s_no: id },
        data: {
          status: 'REJECTED',
          verified_by: verifiedByUserId,
          verified_at: new Date(),
          rejection_reason: rejectionReason,
        },
      });

      // 2. Clear the active submission pointer on rent_payment
      // (so tenant can submit a new proof)
      if (submission.rent_payments_tenant_payment_submissions_rent_payment_idTorent_payments) {
        await tx.rent_payments.update({
          where: { s_no: submission.rent_payment_id },
          data: {
            active_submission_id: null,
          },
        });
      }

      return updatedSubmission;
    });

    this.logger.log(
      `Payment rejected: submission #${id}, rent_payment #${submission.rent_payment_id}, by user #${verifiedByUserId}`,
    );

    // ─── Send push notification to the tenant about rejection ───
    try {
      const pg = await this.prisma.pg_locations.findFirst({
        where: { s_no: submission.pg_id },
        select: { location_name: true },
      });
      const pgName = pg?.location_name || 'your PG';
      const amount = Number(submission.paid_amount || 0);

      await this.notificationService.sendToTenant(submission.tenant_id, {
        title: '❌ Payment Rejected',
        body: `Your payment of ₹${amount.toLocaleString('en-IN')} for ${pgName} was rejected. Reason: ${rejectionReason}. Please pay again.`,
        type: 'PAYMENT_REJECTED',
        data: {
          submission_id: String(id),
          rent_payment_id: String(submission.rent_payment_id),
          amount: String(amount),
          pg_id: String(submission.pg_id),
          rejection_reason: rejectionReason,
          screen: 'TenantPayments',
        },
      });
      this.logger.log(`✅ Rejection notification sent to tenant #${submission.tenant_id}`);
    } catch (err) {
      this.logger.error(`❌ Failed to send rejection notification: ${err}`);
    }

    return ResponseUtil.success(
      result,
      'Payment rejected. Tenant can submit a new payment proof.',
    );
  }

  /**
   * Get verification statistics for the owner's dashboard.
   */
  async getStats(organizationId: number) {
    const [pending, verified, rejected, total] = await Promise.all([
      this.prisma.tenant_payment_submissions.count({
        where: { organization_id: organizationId, status: 'SUBMITTED' },
      }),
      this.prisma.tenant_payment_submissions.count({
        where: { organization_id: organizationId, status: 'VERIFIED' },
      }),
      this.prisma.tenant_payment_submissions.count({
        where: { organization_id: organizationId, status: 'REJECTED' },
      }),
      this.prisma.tenant_payment_submissions.count({
        where: { organization_id: organizationId },
      }),
    ]);

    return ResponseUtil.success({
      pending_verification: pending,
      verified,
      rejected,
      total,
    });
  }
}
