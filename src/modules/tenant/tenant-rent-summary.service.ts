import { Injectable } from '@nestjs/common';

type DecimalLike = number | string | { toNumber?: () => number } | null | undefined;

type RentPayment = {
  s_no?: number;
  amount_paid?: DecimalLike;
  actual_rent_amount?: DecimalLike;
  status?: string | null;
  payment_date?: Date | string | null;
};

type TenantInput = {
  check_in_date: Date | string;
  check_out_date?: Date | string | null;
  beds?: { bed_price?: number | string | { toNumber?: () => number } | null } | null;
  pg_locations?: {
    rent_cycle_type?: 'CALENDAR' | 'MIDMONTH' | null;
    rent_cycle_start?: number | null;
  } | null;
  rent_payments?: RentPayment[];
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
  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private toNum(v: DecimalLike): number {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return parseFloat(v) || 0;
    if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
    return 0;
  }

  /**
   * Generate rent periods month by month from check-in to today.
   * Uses pg_locations.rent_cycle_type and rent_cycle_start (for CALENDAR)
   * or check_in day (for MIDMONTH) to determine period boundaries.
   * Does NOT use tenant_rent_cycles or payment dates.
   */
  private generatePeriods(
    checkIn: Date,
    endDate: Date,
    cycleType: 'CALENDAR' | 'MIDMONTH',
    anchorDay: number,
    monthlyRent: number,
  ): Omit<RentPeriod, 'paid_amount' | 'status' | 'due_amount'>[] {
    const periods: Omit<RentPeriod, 'paid_amount' | 'status' | 'due_amount'>[] = [];
    // Format using local date parts — NOT toISOString() which shifts to UTC and produces
    // the previous day in IST (UTC+5:30) for local-midnight dates.
    const localDateStr = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    let cursor = new Date(checkIn);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= endDate) {
      let periodStart: Date;
      let periodEnd: Date;

      if (cycleType === 'MIDMONTH') {
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const d = cursor.getDate();

        // Clamp day to last day of given month (handles anchor=30 in Feb)
        const clampDay = (cy: number, cm: number, day: number): Date => {
          const lastDay = new Date(cy, cm + 1, 0).getDate();
          return new Date(cy, cm, Math.min(day, lastDay));
        };

        // Use logical month BEFORE clamping to derive nextStart correctly.
        // Compare d against the clamped anchor for the cursor's month (not raw anchorDay).
        // e.g. anchor=31, cursor=Apr30: clampedAnchor=Apr30, d(30)>=30 → logicalStartMonth=Apr ✅
        // e.g. anchor=30, cursor=Feb28: clampedAnchor=Feb28, d(28)>=28 → logicalStartMonth=Feb ✅
        const clampedAnchorForCursorMonth = Math.min(anchorDay, new Date(y, m + 1, 0).getDate());
        const logicalStartMonth = d >= clampedAnchorForCursorMonth ? m : m - 1;
        periodStart = clampDay(y, logicalStartMonth, anchorDay);
        const nextStart = clampDay(y, logicalStartMonth + 1, anchorDay);
        periodEnd = new Date(nextStart);
        periodEnd.setDate(periodEnd.getDate() - 1);

        // Advance cursor to next period's anchor.
        // If the anchor was clamped (e.g. Feb30→Feb28), nextStart.date < anchorDay.
        // Adding 1 day (→Mar1) ensures the next iteration sees d(1)<anchorDay(30)
        // and derives logicalStartMonth=Feb, giving the correct Feb28→Mar29 cycle.
        const nextCursor = clampDay(y, logicalStartMonth + 1, anchorDay);
        if (nextCursor.getDate() < anchorDay) {
          cursor = new Date(nextCursor);
          cursor.setDate(cursor.getDate() + 1);
        } else {
          cursor = nextCursor;
        }
      } else {
        // CALENDAR: 1st to last day of month
        const y = cursor.getFullYear();
        const m = cursor.getMonth();
        const isFirstPeriod = y === checkIn.getFullYear() && m === checkIn.getMonth();
        periodStart = isFirstPeriod ? new Date(checkIn) : new Date(y, m, 1);
        periodEnd = new Date(y, m + 1, 0); // last day of month
        cursor = new Date(y, m + 1, 1);
      }

      periodStart.setHours(0, 0, 0, 0);
      periodEnd.setHours(0, 0, 0, 0);

      // Calculate prorated rent.
      // For MIDMONTH cycles: each full cycle spans exactly periodDays days (e.g. Mar31→Apr29 = 30 days).
      // Using periodDays as both numerator and denominator always yields monthlyRent for full cycles.
      // For CALENDAR cycles: use the calendar month's day count so partial first/last months prorate correctly.
      const periodDays =
        Math.floor((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1;
      const daysInMonth = cycleType === 'MIDMONTH'
        ? periodDays
        : new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate();
      const expectedRent = this.round2(Math.min((monthlyRent / daysInMonth) * periodDays, monthlyRent));

      periods.push({
        period_start: localDateStr(periodStart),
        period_end: localDateStr(periodEnd),
        expected_rent: expectedRent,
      });
    }

    return periods;
  }

  /**
   * Match payments to periods dynamically.
   * Payments are assigned to periods in chronological order by payment_date.
   * If payment_date is missing, they are assigned sequentially from the oldest period.
   */
  private matchPaymentsToPeriods(
    periods: Omit<RentPeriod, 'paid_amount' | 'status' | 'due_amount'>[],
    payments: RentPayment[],
  ): RentPeriod[] {
    // Sort payments by payment_date ascending (nulls last)
    const toUtcDay = (d: Date | string): number => {
      const raw = new Date(d);
      return Date.UTC(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
    };
    const sorted = [...payments].sort((a, b) => {
      const da = a.payment_date ? toUtcDay(a.payment_date) : Infinity;
      const db = b.payment_date ? toUtcDay(b.payment_date) : Infinity;
      return da - db;
    });

    // Build a mutable paid map per period index
    const paidMap: number[] = periods.map(() => 0);

    for (const payment of sorted) {
      let remaining = this.round2(this.toNum(payment.amount_paid));
      if (remaining <= 0) continue;

      // Sequential fill with overflow spillover:
      // Fill the first underpaid period up to its expected_rent, then spill any
      // remainder into the next underpaid period, and so on.
      for (let i = 0; i < periods.length && remaining > 0; i++) {
        const due = this.round2(periods[i].expected_rent - paidMap[i]);
        if (due <= 0) continue;
        const apply = Math.min(remaining, due);
        paidMap[i] = this.round2(paidMap[i] + apply);
        remaining = this.round2(remaining - apply);
      }
    }

    return periods.map((p, i) => {
      const paidAmount = this.round2(paidMap[i]);
      let status: RentPeriod['status'];
      if (paidAmount >= p.expected_rent) {
        status = 'PAID';
      } else if (paidAmount > 0) {
        status = 'PARTIAL';
      } else {
        status = 'PENDING';
      }
      return {
        ...p,
        paid_amount: paidAmount,
        status,
        due_amount: this.round2(Math.max(0, p.expected_rent - paidAmount)),
      };
    });
  }

  buildRentSummary(params: { tenant: TenantInput }): RentSummaryResult {
    const { tenant } = params;

    const monthlyRent = this.round2(this.toNum(tenant.beds?.bed_price));
    const cycleType: 'CALENDAR' | 'MIDMONTH' =
      tenant.pg_locations?.rent_cycle_type === 'MIDMONTH' ? 'MIDMONTH' : 'CALENDAR';

    const checkIn = new Date(tenant.check_in_date);
    checkIn.setHours(0, 0, 0, 0);

    // Anchor day: for MIDMONTH = check-in day; for CALENDAR = rent_cycle_start (default 1)
    const anchorDay =
      cycleType === 'MIDMONTH' ? checkIn.getDate() : (tenant.pg_locations?.rent_cycle_start ?? 1);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Parse "YYYY-MM-DD" strings as local midnight (new Date(str) parses as UTC which is wrong in IST)
    const parseLocalDate = (s: string): Date => {
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      dt.setHours(0, 0, 0, 0);
      return dt;
    };

    const checkOut = tenant.check_out_date ? new Date(tenant.check_out_date) : null;
    checkOut?.setHours(0, 0, 0, 0);
    const endDate = checkOut && checkOut < now ? checkOut : now;

    // Valid payments only (exclude VOIDED/FAILED)
    const validPayments = (tenant.rent_payments || []).filter(
      (p) => p.status === 'PAID' || p.status === 'PARTIAL' || p.status === 'PENDING',
    );

    // 1. Generate periods dynamically
    const rawPeriods = this.generatePeriods(checkIn, endDate, cycleType, anchorDay, monthlyRent);

    // 2. Match payments to periods
    const periods = this.matchPaymentsToPeriods(rawPeriods, validPayments);

    // 3. Aggregate results
    let partialDueAmount = 0;
    let pendingDueAmount = 0;
    const unpaidMonths: RentSummaryResult['unpaid_months'] = [];
    const partialPayments: RentPayment[] = [];

    for (const period of periods) {
      // Only count periods that have started (period_start <= today)
      const periodStart = parseLocalDate(period.period_start);
      if (periodStart > now) continue;

      if (period.status === 'PARTIAL') {
        partialDueAmount = this.round2(partialDueAmount + period.due_amount);
        // Collect partial payments that fall in this period
        const periodPartials = validPayments.filter((p) => {
          if (p.status !== 'PARTIAL' || !p.payment_date) return false;
          const d = new Date(p.payment_date);
          d.setHours(0, 0, 0, 0);
          return d >= parseLocalDate(period.period_start) && d <= parseLocalDate(period.period_end);
        });
        partialPayments.push(...periodPartials);
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

    // 4. Overall status
    const allStarted = periods.filter((p) => parseLocalDate(p.period_start) <= now);
    let paymentStatus: RentSummaryResult['payment_status'];
    if (allStarted.every((p) => p.status === 'PAID')) {
      paymentStatus = 'PAID';
    } else if (partialDueAmount > 0 && pendingDueAmount > 0) {
      paymentStatus = 'MIXED';
    } else if (partialDueAmount > 0) {
      paymentStatus = 'PARTIAL';
    } else if (pendingDueAmount > 0) {
      paymentStatus = 'PENDING';
    } else {
      paymentStatus = 'PAID';
    }

    // 5. Current cycle
    const currentPeriod = periods.find((p) => {
      const start = parseLocalDate(p.period_start);
      const end = parseLocalDate(p.period_end);
      return now >= start && now <= end;
    });
    const currentCycle = currentPeriod
      ? {
          cycle_start: currentPeriod.period_start,
          cycle_end: currentPeriod.period_end,
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
}
