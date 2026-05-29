import { Injectable } from '@nestjs/common';

/**
 * Tenant Status Service
 * Handles all tenant rent status calculations based on payment records
 */

interface AdvancePayment {
  status: 'PAID' | 'PENDING' | 'FAILED';
}

interface RefundPayment {
  status: 'PAID' | 'PENDING' | 'FAILED' | 'PARTIAL';
}

interface RentSummaryData {
  payment_status: 'PAID' | 'PARTIAL' | 'PENDING' | 'MIXED';
  partial_due_amount: number;
  pending_due_amount: number;
  rent_due_amount: number;
  unpaid_months: { cycle_start: string; cycle_end: string; cycle_type: string }[];
}

interface TenantData {
  advance_payments?: AdvancePayment[];
  refund_payments?: RefundPayment[];
  /** Rent summary from TenantRentSummaryService */
  rent_summary?: RentSummaryData;
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

    const parseToDate = (dateStr: string): Date => {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? new Date(dateStr + 'T00:00:00.000Z') : d;
    };

    const inCurrent = cycleSummaries.find((c) => {
      const start = parseToDate(String(c.start_date));
      const end = parseToDate(String(c.end_date));
      return start <= referenceDateOnlyUtc && referenceDateOnlyUtc <= end;
    });
    if (inCurrent) return inCurrent;

    const mostRecentStarted = cycleSummaries.find((c) => {
      const start = parseToDate(String(c.start_date));
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
   * Calculate pending months from rent summary
   */
  private calculatePendingMonths(tenant: TenantData): number {
    return tenant.rent_summary?.unpaid_months?.length || 0;
  }

  /**
   * Calculate tenant rent status from rent summary
   * Uses TenantRentSummaryService as source of truth for rent calculations
   */
  calculateTenantStatus(tenant: TenantData): TenantStatusResult {
    // Check advance and refund payments
    const is_advance_paid = tenant.advance_payments?.some((p) => p.status === 'PAID') || false;
    const is_refund_paid = tenant.refund_payments?.some((p) => p.status === 'PAID') || false;

    const summary = tenant.rent_summary;
    const pendingMonths = this.calculatePendingMonths(tenant);

    // Use rent summary data for all rent-related calculations
    const partial_due_amount = summary?.partial_due_amount || 0;
    const pending_due_amount = summary?.pending_due_amount || 0;
    const rent_due_amount = summary?.rent_due_amount || 0;
    const is_rent_partial = partial_due_amount > 0;
    const is_rent_paid = summary?.payment_status === 'PAID' && pendingMonths === 0;

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

    const toNumber = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return parseFloat(v) || 0;
      return 0;
    };

    const mapUnpaidMonth = (m: unknown): { cycle_start: string; cycle_end: string; cycle_type: string } => {
      const month = m as Record<string, unknown>;
      return {
        cycle_start: String(month.cycle_start || ''),
        cycle_end: String(month.cycle_end || ''),
        cycle_type: String(month.cycle_type || 'CALENDAR'),
      };
    };

    return {
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
      rent_summary: {
        payment_status: (t.payment_status as 'PAID' | 'PARTIAL' | 'PENDING' | 'MIXED') || 'PENDING',
        partial_due_amount: toNumber(t.partial_due_amount),
        pending_due_amount: toNumber(t.pending_due_amount),
        rent_due_amount: toNumber(t.rent_due_amount),
        unpaid_months: (t.unpaid_months as Array<Record<string, unknown>> | undefined)?.map(mapUnpaidMonth) || [],
      },
    };
  }
}
