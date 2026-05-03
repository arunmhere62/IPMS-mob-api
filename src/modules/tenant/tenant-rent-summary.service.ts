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

        if (d >= anchorDay) {
          periodStart = clampDay(y, m, anchorDay);
          // nextStart is clamped to next month's last day if needed
          const nextStart = clampDay(periodStart.getFullYear(), periodStart.getMonth() + 1, anchorDay);
          periodEnd = new Date(nextStart);
          periodEnd.setDate(periodEnd.getDate() - 1);
        } else {
          periodStart = clampDay(y, m - 1, anchorDay);
          const nextStart = clampDay(periodStart.getFullYear(), periodStart.getMonth() + 1, anchorDay);
          periodEnd = new Date(nextStart);
          periodEnd.setDate(periodEnd.getDate() - 1);
        }
        // Advance cursor to the next period start (clamped)
        cursor = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, anchorDay);
        const cursorLastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(anchorDay, cursorLastDay));
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

      // Calculate prorated rent
      const daysInMonth = new Date(
        periodStart.getFullYear(),
        periodStart.getMonth() + 1,
        0,
      ).getDate();
      const periodDays =
        Math.floor((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1;
      const expectedRent = this.round2((monthlyRent / daysInMonth) * periodDays);

      periods.push({
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
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
    const sorted = [...payments].sort((a, b) => {
      const da = a.payment_date ? new Date(a.payment_date).getTime() : Infinity;
      const db = b.payment_date ? new Date(b.payment_date).getTime() : Infinity;
      return da - db;
    });

    // Build a mutable paid map per period index
    const paidMap: number[] = periods.map(() => 0);

    for (const payment of sorted) {
      const paid = this.round2(this.toNum(payment.amount_paid));
      if (paid <= 0) continue;

      const payDate = payment.payment_date ? new Date(payment.payment_date) : null;
      payDate?.setHours(0, 0, 0, 0);

      // Find the best-matching period: if payDate exists, use the period that
      // contains it; otherwise fall back to the first unpaid/partially paid period
      let targetIdx = -1;

      if (payDate) {
        targetIdx = periods.findIndex((p) => {
          const start = new Date(p.period_start);
          const end = new Date(p.period_end);
          return payDate >= start && payDate <= end;
        });
      }

      if (targetIdx === -1) {
        // Assign to the first period that is not yet fully paid
        targetIdx = periods.findIndex((p, i) => paidMap[i] < p.expected_rent);
      }

      if (targetIdx !== -1) {
        paidMap[targetIdx] = this.round2(paidMap[targetIdx] + paid);
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
      const periodStart = new Date(period.period_start);
      if (periodStart > now) continue;

      if (period.status === 'PARTIAL') {
        partialDueAmount = this.round2(partialDueAmount + period.due_amount);
        // Collect partial payments that fall in this period
        const periodPartials = validPayments.filter((p) => {
          if (p.status !== 'PARTIAL' || !p.payment_date) return false;
          const d = new Date(p.payment_date);
          d.setHours(0, 0, 0, 0);
          return d >= new Date(period.period_start) && d <= new Date(period.period_end);
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
    const allStarted = periods.filter((p) => new Date(p.period_start) <= now);
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
      const start = new Date(p.period_start);
      const end = new Date(p.period_end);
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
