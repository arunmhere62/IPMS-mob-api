import { Injectable } from '@nestjs/common';
import { RentCalculationUtil } from './rent-calculation.util';

// ─── Shared types ──────────────────────────────────────────────────────────────

type DecimalLike = number | string | { toNumber?: () => number } | null | undefined;

type RentPayment = {
  s_no?: number;
  amount_paid?: DecimalLike;
  actual_rent_amount?: DecimalLike;
  status?: string | null;
  payment_date?: Date | string | null;
  /** FK linking payment to a tenant_rent_cycle row */
  cycle_id?: number | null;
};

type TenantRentCycle = {
  s_no: number;
  cycle_type?: string | null;
  anchor_day?: number | null;
  cycle_start: Date | string;
  cycle_end: Date | string;
};

type AllocationEntry = {
  effective_from: Date | string;
  effective_to?: Date | string | null;
  bed_price_snapshot?: DecimalLike;
};

// ─── Input shape (must match what the Prisma query returns) ───────────────────

type TenantInput = {
  check_in_date: Date | string;
  check_out_date?: Date | string | null;
  beds?: { bed_price?: DecimalLike } | null;
  pg_locations?: {
    rent_cycle_type?: 'CALENDAR' | 'MIDMONTH' | null;
    rent_cycle_start?: number | null;
  } | null;
  /** Payments — must include cycle_id so we can match per cycle */
  rent_payments?: RentPayment[];
  /** Pre-generated cycles from DB (tenant_rent_cycles) */
  tenant_rent_cycles?: TenantRentCycle[] | null;
  /** Bed price history — used to compute correct expected rent per cycle */
  tenant_allocations?: AllocationEntry[] | null;
};

type RentPeriod = {
  period_start: string;
  period_end: string;
  expected_rent: number;
  paid_amount: number;
  status: 'PAID' | 'PARTIAL' | 'PENDING';
  due_amount: number;
};

type RentSummaryResult = {
  periods: RentPeriod[];
  payment_status: 'PAID' | 'PARTIAL' | 'PENDING' | 'MIXED';
  partial_due_amount: number;
  pending_due_amount: number;
  rent_due_amount: number;
  unpaid_months: { cycle_start: string; cycle_end: string; cycle_type: string }[];
  partial_payments: RentPayment[];
  current_cycle: { cycle_start: string; cycle_end: string; cycle_type: string } | null;
  payment_cycle_summaries: unknown[];
  total_partial_due: number;
};

@Injectable()
export class TenantRentSummaryService {
  // ─── Helpers ──────────────────────────────────────────────────────────────

  private round2(n: number): number {
    return RentCalculationUtil.moneyRound2(n);
  }

  private toNum(v: DecimalLike): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseFloat(v) || 0;
    if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
    return 0;
  }

  /** Parse a UTC Date or ISO string to a UTC-midnight Date */
  private toUtcDate(v: Date | string): Date {
    return RentCalculationUtil.toDateOnlyUtc(new Date(v));
  }

  /** Format a Date to 'YYYY-MM-DD' using its UTC components */
  private formatUtcDate(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Build a complete rent summary for a tenant.
   *
   * Requirements (the Prisma query must include these):
   *   - tenant_rent_cycles  → one row per billing period from DB
   *   - rent_payments       → must include cycle_id
   *   - tenant_allocations  → bed price history (for historical accuracy)
   */
  buildRentSummary(params: { tenant: TenantInput }): RentSummaryResult {
    const { tenant } = params;

    const cycleType: 'CALENDAR' | 'MIDMONTH' =
      tenant.pg_locations?.rent_cycle_type === 'MIDMONTH' ? 'MIDMONTH' : 'CALENDAR';

    // Today in UTC midnight
    const today = RentCalculationUtil.toDateOnlyUtc(new Date());

    const checkIn = this.toUtcDate(tenant.check_in_date);

    // ── Step 1: Get cycles that are valid for this tenant ─────────────────
    // Rules:
    //   - cycle_start >= check_in_date  (ignore phantom cycles from before check-in)
    //   - cycle_start <= today          (don't count future cycles)
    // For MIDMONTH, the anchor_day on each cycle must match the tenant's actual
    // check-in day. Stale cycles with a different anchor_day (e.g. created before
    // check_in_date was corrected) would produce false PENDING periods.
    const expectedAnchorDay = checkIn.getUTCDate();

    const cycles = ((tenant.tenant_rent_cycles ?? []) as TenantRentCycle[])
      .map((c) => ({
        s_no: c.s_no,
        cycle_type: c.cycle_type ?? cycleType,
        anchor_day: c.anchor_day ?? null,
        cycle_start: this.toUtcDate(c.cycle_start),
        cycle_end: this.toUtcDate(c.cycle_end),
      }))
      .filter((c) => {
        if (c.cycle_start < checkIn || c.cycle_start > today) return false;
        if (cycleType === 'MIDMONTH' && c.anchor_day !== null && c.anchor_day !== expectedAnchorDay) return false;
        return true;
      })
      .sort((a, b) => a.cycle_start.getTime() - b.cycle_start.getTime());

    // ── Step 2: Group valid payments by cycle_id ───────────────────────────
    const validPayments = (tenant.rent_payments ?? []).filter(
      (p) => p.status === 'PAID' || p.status === 'PARTIAL' || p.status === 'PENDING',
    );

    const paymentsByCycle = new Map<number, RentPayment[]>();
    for (const p of validPayments) {
      if (!p.cycle_id) continue;
      if (!paymentsByCycle.has(p.cycle_id)) paymentsByCycle.set(p.cycle_id, []);
      paymentsByCycle.get(p.cycle_id)!.push(p);
    }

    // ── Step 3: Build a RentPeriod for each cycle ──────────────────────────
    const allocations = ((tenant.tenant_allocations ?? []) as AllocationEntry[]).map((a) => ({
      effective_from: this.toUtcDate(a.effective_from),
      effective_to: a.effective_to ? this.toUtcDate(a.effective_to) : null,
      bed_price_snapshot: a.bed_price_snapshot,
    }));

    const fallbackPrice = this.toNum(tenant.beds?.bed_price);

    const periods: RentPeriod[] = cycles.map((cycle) => {
      // Expected rent: use allocation snapshot if available, otherwise current bed price
      const expectedRent = this._getExpectedRent({
        cycleStart: cycle.cycle_start,
        cycleEnd: cycle.cycle_end,
        cycleType,
        allocations,
        fallbackPrice,
      });

      // Paid amount: sum of all payments linked to this cycle via cycle_id
      const cyclePmts = paymentsByCycle.get(cycle.s_no) ?? [];
      const paidAmount = this.round2(
        cyclePmts.reduce((sum, p) => sum + this.toNum(p.amount_paid), 0),
      );

      const dueAmount = this.round2(Math.max(0, expectedRent - paidAmount));

      let status: RentPeriod['status'];
      if (paidAmount >= expectedRent) status = 'PAID';
      else if (paidAmount > 0) status = 'PARTIAL';
      else status = 'PENDING';

      return {
        period_start: this.formatUtcDate(cycle.cycle_start),
        period_end: this.formatUtcDate(cycle.cycle_end),
        expected_rent: expectedRent,
        paid_amount: paidAmount,
        status,
        due_amount: dueAmount,
      };
    });

    // ── Step 4: Aggregate ──────────────────────────────────────────────────
    let partialDueAmount = 0;
    let pendingDueAmount = 0;
    const unpaidMonths: RentSummaryResult['unpaid_months'] = [];
    const partialPayments: RentPayment[] = [];

    for (const period of periods) {
      if (period.status === 'PARTIAL') {
        partialDueAmount = this.round2(partialDueAmount + period.due_amount);
        // Collect the partial payment records for this period
        const cycleEntry = cycles.find((c) => this.formatUtcDate(c.cycle_start) === period.period_start);
        if (cycleEntry) {
          const pmts = paymentsByCycle.get(cycleEntry.s_no) ?? [];
          partialPayments.push(...pmts.filter((p) => p.status === 'PARTIAL'));
        }
      } else if (period.status === 'PENDING') {
        pendingDueAmount = this.round2(pendingDueAmount + period.due_amount);
        unpaidMonths.push({
          cycle_start: period.period_start,
          cycle_end: period.period_end,
          cycle_type: cycleType,
        });
      }
    }

    const rentDueAmount = this.round2(partialDueAmount + pendingDueAmount);

    // ── Step 5: Overall payment status ────────────────────────────────────
    // No cycles + tenant already checked in = rent is due but not recorded yet → PENDING
    // Cycles exist but last cycle ended before today = rent is due for current period → PENDING
    let paymentStatus: RentSummaryResult['payment_status'];
    if (periods.length === 0) {
      paymentStatus = checkIn < today ? 'PENDING' : 'PAID';
    } else if (periods.every((p) => p.status === 'PAID')) {
      // Check if any cycle contains today
      const currentCycleEntry = cycles.find(
        (c) => c.cycle_start <= today && c.cycle_end >= today,
      );
      // If all cycles are paid but no cycle contains today, rent is pending for current period
      paymentStatus = currentCycleEntry ? 'PAID' : 'PENDING';
    } else if (partialDueAmount > 0 && pendingDueAmount > 0) {
      paymentStatus = 'MIXED';
    } else if (partialDueAmount > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'PENDING';
    }

    // ── Step 6: Current cycle (the cycle that contains today) ─────────────
    const currentCycleEntry = cycles.find(
      (c) => c.cycle_start <= today && c.cycle_end >= today,
    );
    const currentCycle = currentCycleEntry
      ? {
          cycle_start: this.formatUtcDate(currentCycleEntry.cycle_start),
          cycle_end: this.formatUtcDate(currentCycleEntry.cycle_end),
          cycle_type: cycleType,
        }
      : null;

    return {
      periods,
      payment_status: paymentStatus,
      partial_due_amount: partialDueAmount,
      pending_due_amount: pendingDueAmount,
      rent_due_amount: rentDueAmount,
      unpaid_months: unpaidMonths,
      partial_payments: partialPayments,
      current_cycle: currentCycle,
      payment_cycle_summaries: [],
      total_partial_due: partialDueAmount,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Calculate expected rent for a cycle using allocation price snapshots.
   * Falls back to current bed price if no allocation data is available.
   *
   * - MIDMONTH: full bed price (no proration — each cycle is exactly one month)
   * - CALENDAR: prorated if first/last cycle is partial month
   */
  private _getExpectedRent(params: {
    cycleStart: Date;
    cycleEnd: Date;
    cycleType: 'CALENDAR' | 'MIDMONTH';
    allocations: Array<{ effective_from: Date; effective_to: Date | null; bed_price_snapshot: DecimalLike }>;
    fallbackPrice: number;
  }): number {
    const { cycleStart, cycleEnd, cycleType, allocations, fallbackPrice } = params;

    // Try allocation-based price first (historical accuracy)
    if (allocations.length > 0) {
      const due = RentCalculationUtil.computeExpectedDueFromAllocations({
        periodStart: cycleStart,
        periodEnd: cycleEnd,
        cycleType,
        allocations: allocations.map((a) => ({
          effective_from: a.effective_from,
          effective_to: a.effective_to,
          bed_price_snapshot: a.bed_price_snapshot,
        })),
      });
      if (due > 0) return this.round2(due);
    }

    // Fallback: use current bed price with proration
    if (fallbackPrice <= 0) return 0;
    return this.round2(
      RentCalculationUtil.computeProratedAmountForMonth(fallbackPrice, cycleStart, cycleEnd),
    );
  }
}
