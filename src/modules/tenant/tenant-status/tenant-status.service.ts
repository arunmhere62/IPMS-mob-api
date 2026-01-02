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
    const isRentPartialBase = params.paymentStatus === 'PARTIAL' && params.partialDueAmount > 0;
    const is_rent_paid = params.unpaidMonthsCount === 0 && isRentPaidBase;
    const is_rent_partial = !is_rent_paid && isRentPartialBase;
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
        let yearDiff = now.getFullYear() - checkInDate.getFullYear();
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
    const is_advance_paid =
      tenant.advance_payments?.some((p) => p.status === 'PAID') || false;
    const is_refund_paid =
      tenant.refund_payments?.some((p) => p.status === 'PAID') || false;

    // Check for rent payment issues
    const hasPartialPayment =
      tenant.rent_payments?.some((p) => p.status === 'PARTIAL') || false;

    // Calculate pending months
    const pendingMonths = this.calculatePendingMonths(tenant);

    // Rent is partial if there are partial payments
    const is_rent_partial = hasPartialPayment;

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
  enrichTenantsWithStatus(tenants: any[]): any[] {
    return tenants.map((tenant) => {
      const statusData = this.calculateTenantStatus(this.mapTenantData(tenant));
      return {
        ...tenant,
        ...statusData,
      };
    });
  }

  /**
   * Get active tenants with pending rent
   * Returns tenants with PENDING/FAILED payments, rent gaps, or no rent record but past check-in date
   * NOTE: A tenant can appear in BOTH pending and partial tabs if they have both types of payments
   */
  getTenantsWithPendingRent(tenants: any[]): any[] {
    const enrichedTenants = this.enrichTenantsWithStatus(tenants);

    const filteredTenants = enrichedTenants.filter((tenant) => {
      if (tenant.status !== 'ACTIVE') return false;

      // Include tenant if they have any pending/failed payments
      const hasPendingOrFailed = tenant.rent_payments?.some(
        (p: any) => p.status === 'PENDING' || p.status === 'FAILED'
      );

      // Include tenant if they have pending months (even if they also have partial payments)
      const hasPendingMonths = tenant.pending_months > 0;

      // Include if they have pending/failed payments OR pending months
      return hasPendingOrFailed || hasPendingMonths;
    });
    return filteredTenants;
  }

  /**
   * Get active tenants with partial rent
   * Returns tenants with PARTIAL payments
   */
  getTenantsWithPartialRent(tenants: any[]): any[] {
    const enrichedTenants = this.enrichTenantsWithStatus(tenants);
    return enrichedTenants.filter(
      (tenant) => tenant.status === 'ACTIVE' && tenant.is_rent_partial
    );
  }

  /**
   * Get active tenants without advance payment
   * Returns tenants that haven't paid advance
   */
  getTenantsWithoutAdvance(tenants: any[]): any[] {
    const enrichedTenants = this.enrichTenantsWithStatus(tenants);
    return enrichedTenants.filter(
      (tenant) => tenant.status === 'ACTIVE' && !tenant.is_advance_paid
    );
  }

  /**
   * Map database tenant object to TenantData interface
   */
  private mapTenantData(tenant: any): TenantData {
    return {
      rent_payments: tenant.rent_payments?.map((p: any) => ({
        status: p.status,
        actual_rent_amount: p.actual_rent_amount,
        amount_paid: p.amount_paid,
      })),
      advance_payments: tenant.advance_payments?.map((p: any) => ({
        status: p.status,
      })),
      refund_payments: tenant.refund_payments?.map((p: any) => ({
        status: p.status,
      })),
      check_in_date: tenant.check_in_date,
      check_out_date: tenant.check_out_date,
      rooms: tenant.rooms
        ? {
            rent_price: tenant.rooms.rent_price,
          }
        : undefined,
    };
  }
}
