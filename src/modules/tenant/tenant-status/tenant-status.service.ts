import { Injectable } from '@nestjs/common';

/**
 * Tenant Status Service
 * Handles all tenant rent status calculations based on payment records
 */

interface TenantPayment {
  status: 'PAID' | 'PENDING' | 'FAILED' | 'PARTIAL';
  actual_rent_amount: string | number;
  amount_paid: string | number;
}

interface AdvancePayment {
  status: 'PAID' | 'PENDING' | 'FAILED';
}

interface RefundPayment {
  status: 'PAID' | 'PENDING' | 'FAILED' | 'PARTIAL';
}

interface TenantData {
  rent_payments?: TenantPayment[];
  advance_payments?: AdvancePayment[];
  refund_payments?: RefundPayment[];
  check_in_date?: string | Date;
  check_out_date?: string | Date;
  rooms?: {
    rent_price: string | number;
  };
}

export interface TenantStatusResult {
  is_rent_paid: boolean;
  is_rent_partial: boolean;
  rent_due_amount: number; // Total due amount (partial + pending)
  partial_due_amount: number; // Only partial payment remaining amounts
  pending_due_amount: number; // Only pending/failed payment amounts
  is_advance_paid: boolean;
  is_refund_paid: boolean;
  pending_months: number;
}

export type CycleSummaryLike = {
  start_date: string;
  end_date: string;
  status?: string;
};

@Injectable()
export class TenantStatusService {
  classifyGap(params: {
    rentDue?: number | string | null;
    totalPaid?: number | string | null;
    remainingDue?: number | string | null;
  }): 'PENDING' | 'PARTIAL' | 'NONE' {
    const rentDue = Number(params.rentDue || 0);
    const totalPaid = Number(params.totalPaid || 0);
    const remainingDue = Number(params.remainingDue || 0);

    // No due / nothing missing
    if (!(remainingDue > 0) || !(rentDue > 0)) return 'NONE';

    // If any payment was made for the cycle but there is still remaining due, it's a PARTIAL gap.
    if (totalPaid > 0) return 'PARTIAL';

    // Otherwise it's a pure missing payment cycle.
    return 'PENDING';
  }

  selectRelevantCycle(params: {
    cycleSummaries: CycleSummaryLike[];
    referenceDateOnlyUtc: Date;
  }): CycleSummaryLike | null {
    const { cycleSummaries, referenceDateOnlyUtc } = params;
    if (!cycleSummaries || cycleSummaries.length === 0) return null;

    const inCurrent = cycleSummaries.find((c) => {
      const start = new Date(String(c.start_date) + 'T00:00:00.000Z');
      const end = new Date(String(c.end_date) + 'T00:00:00.000Z');
      return start <= referenceDateOnlyUtc && referenceDateOnlyUtc <= end;
    });
    if (inCurrent) return inCurrent;

    const mostRecentStarted = cycleSummaries.find((c) => {
      const start = new Date(String(c.start_date) + 'T00:00:00.000Z');
      return start <= referenceDateOnlyUtc;
    });
    return mostRecentStarted || null;
  }

  deriveRentFlags(params: {
    paymentStatus: string;
    unpaidMonthsCount: number;
    partialDueAmount: number;
  }): { is_rent_paid: boolean; is_rent_partial: boolean } {
    const isRentPaidBase = params.paymentStatus === 'PAID';
    const hasPartialDue = Number(params.partialDueAmount || 0) > 0;

    // Rent is considered fully paid only if:
    // - the relevant/current cycle is PAID
    // - there are no unpaid months
    // - there is no outstanding partial due from any previous cycle
    const is_rent_paid = params.unpaidMonthsCount === 0 && isRentPaidBase && !hasPartialDue;

    // If there is any partial due (even from a previous cycle), mark as partial.
    const is_rent_partial = hasPartialDue;
    return { is_rent_paid, is_rent_partial };
  }

  /**
   * Calculate pending months for a tenant
   * Checks for PENDING/PARTIAL/FAILED payments or missing rent periods
   */
  private calculatePendingMonths(tenant: TenantData): number {
    // If no rent records, check time since check-in date
    if (!tenant.rent_payments || tenant.rent_payments.length === 0) {
      if (!tenant.check_in_date) return 0;

      const now = new Date();
      const checkInDate = new Date(tenant.check_in_date);

      // If tenant checked in before today, always mark as pending
      if (checkInDate < now) {
        // Calculate months between check-in and now
        const yearDiff = now.getFullYear() - checkInDate.getFullYear();
        let monthDiff = now.getMonth() - checkInDate.getMonth();

        // Adjust for day of month - if current day is on or after check-in day, add 1 month
        // (meaning the full month has passed)
        if (now.getDate() >= checkInDate.getDate()) {
          monthDiff++;
        }

        return Math.max(1, yearDiff * 12 + monthDiff);
      }
      return 0;
    }

    // Count payments with PENDING or FAILED status
    // PARTIAL payments should NOT be counted as pending months (they're tracked separately)
    let pendingCount = 0;

    tenant.rent_payments.forEach((payment) => {
      if (payment.status === 'PENDING' || payment.status === 'FAILED') {
        pendingCount++;
      }
    });

    return pendingCount;
  }

  /**
   * Calculate tenant rent status based on payment records
   * Detects pending or partial payments
   */
  calculateTenantStatus(tenant: TenantData): TenantStatusResult {
    // Check advance and refund payments
    const is_advance_paid = tenant.advance_payments?.some((p) => p.status === 'PAID') || false;
    const is_refund_paid = tenant.refund_payments?.some((p) => p.status === 'PAID') || false;

    // Calculate pending months
    const pendingMonths = this.calculatePendingMonths(tenant);

    // Calculate due amounts (separate partial and pending)
    let partial_due_amount = 0;
    let pending_due_amount = 0;
    const rentPrice = Number(tenant.rooms?.rent_price || 0);

    if (tenant.rent_payments && tenant.rent_payments.length > 0) {
      // Sum due amounts from PARTIAL and PENDING payments separately
      tenant.rent_payments.forEach((p) => {
        if (p.status === 'PARTIAL') {
          const expected = Number(p.actual_rent_amount || 0);
          const paid = Number(p.amount_paid || 0);
          partial_due_amount += expected - paid;
        } else if (p.status === 'PENDING' || p.status === 'FAILED') {
          pending_due_amount += Number(p.actual_rent_amount || 0);
        }
      });
    } else if (pendingMonths > 0) {
      // No payments but pending months (based on check-in date)
      pending_due_amount = rentPrice * pendingMonths;
    }

    // Rent is partial only if there is still partial due remaining.
    // This prevents the partial filter from including tenants who had PARTIAL payments historically but are fully settled now.
    const is_rent_partial = partial_due_amount > 0;

    const rent_due_amount = partial_due_amount + pending_due_amount;

    // Determine is_rent_paid: false if there are unpaid months, true otherwise
    // Note: unpaid_months is calculated separately in tenant.service.ts based on rent cycle dates
    // This will be overridden in tenant.service.ts if unpaid_months > 0
    const is_rent_paid = pendingMonths === 0;

    return {
      is_rent_paid,
      is_rent_partial,
      rent_due_amount,
      partial_due_amount,
      pending_due_amount,
      is_advance_paid,
      is_refund_paid,
      pending_months: pendingMonths,
    };
  }

  /**
   * Enrich tenant list with status calculations
   * Simplified version
   */
  enrichTenantsWithStatus(tenants: unknown[]): unknown[] {
    return tenants.map((tenant) => {
      const statusData = this.calculateTenantStatus(this.mapTenantData(tenant));
      return {
        ...(tenant as Record<string, unknown>),
        ...statusData,
      };
    });
  }

  /**
   * Get active tenants with pending rent
   * Returns tenants with PENDING/FAILED payments, rent gaps, or no rent record but past check-in date
   * NOTE: A tenant can appear in BOTH pending and partial tabs if they have both types of payments
   */
  getTenantsWithPendingRent(tenants: unknown[]): unknown[] {
    // Don't re-enrich - use already enriched data from tenant.service
    const filteredTenants = tenants.filter((tenant) => {
      const t = tenant as Record<string, unknown>;
      if (t.status !== 'ACTIVE') return false;

      // Include tenant if they have pending due amount (regardless of partial due)
      const pendingDue = Number(t.pending_due_amount || 0);

      // Include tenant if they have unpaid months (from rent cycle calculation)
      const unpaidMonths = (t.unpaid_months as Array<{ month_name?: string }> | undefined) || [];
      const hasUnpaidMonths = unpaidMonths.length > 0;

      // Include if they have pending due OR unpaid months
      return pendingDue > 0 || hasUnpaidMonths;
    });
    return filteredTenants;
  }

  /**
   * Get active tenants with partial rent
   * Returns tenants with PARTIAL payments
   */
  getTenantsWithPartialRent(tenants: unknown[]): unknown[] {
    // Don't re-enrich - use already enriched data from tenant.service
    const filteredTenants = tenants.filter((tenant) => {
      const t = tenant as Record<string, unknown>;
      if (t.status !== 'ACTIVE') return false;

      const partialDue = Number(t.partial_due_amount || 0);
      return partialDue > 0;
    });
    return filteredTenants;
  }

  /**
   * Get active tenants without advance payment
   */
  getTenantsWithoutAdvance(tenants: unknown[]): unknown[] {
    // Don't re-enrich - use already enriched data from tenant.service
    const filteredTenants = tenants.filter((tenant) => {
      const t = tenant as Record<string, unknown>;
      if (t.status !== 'ACTIVE') return false;

      const isAdvancePaid = t.is_advance_paid as boolean;
      return !isAdvancePaid;
    });
    return filteredTenants;
  }

  private mapTenantData(tenant: unknown): TenantData {
    const t = tenant as Record<string, unknown>;

    const toPaymentStatus = (s: unknown): TenantPayment['status'] => {
      const status = typeof s === 'string' ? s : '';
      if (status === 'PAID' || status === 'PENDING' || status === 'FAILED' || status === 'PARTIAL')
        return status;
      return 'PENDING';
    };

    const toAdvanceStatus = (v: unknown): AdvancePayment['status'] => {
      const status = typeof v === 'string' ? v : '';
      if (status === 'PAID' || status === 'PENDING' || status === 'FAILED') return status;
      return 'PENDING';
    };

    const toRefundStatus = (v: unknown): RefundPayment['status'] => {
      const status = typeof v === 'string' ? v : '';
      if (status === 'PAID' || status === 'PENDING' || status === 'FAILED' || status === 'PARTIAL')
        return status;
      return 'PENDING';
    };

    const toStringOrNumber = (v: unknown): string | number => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return v;
      return 0;
    };

    const toDateLike = (v: unknown): string | Date | undefined => {
      if (typeof v === 'string') return v;
      if (v instanceof Date) return v;
      return undefined;
    };

    const roomsRentPrice = (rooms: unknown): string | number | undefined => {
      if (!rooms || typeof rooms !== 'object') return undefined;
      const r = rooms as Record<string, unknown>;
      if (typeof r.rent_price === 'string' || typeof r.rent_price === 'number') return r.rent_price;
      return undefined;
    };

    return {
      rent_payments: (t.rent_payments as Array<Record<string, unknown>> | undefined)?.map(
        (p: Record<string, unknown>) => ({
          status: toPaymentStatus(p.status),
          actual_rent_amount: toStringOrNumber(p.actual_rent_amount),
          amount_paid: toStringOrNumber(p.amount_paid),
        }),
      ),
      advance_payments: (t.advance_payments as Array<Record<string, unknown>> | undefined)?.map(
        (p: Record<string, unknown>) => ({
          status: toAdvanceStatus(p.status),
        }),
      ),
      refund_payments: (t.refund_payments as Array<Record<string, unknown>> | undefined)?.map(
        (p: Record<string, unknown>) => ({
          status: toRefundStatus(p.status),
        }),
      ),
      check_in_date: toDateLike(t.check_in_date),
      check_out_date: toDateLike(t.check_out_date),
      rooms: t.rooms
        ? {
            rent_price: roomsRentPrice(t.rooms) ?? 0,
          }
        : undefined,
    };
  }
}
