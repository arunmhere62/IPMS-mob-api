import { Injectable } from '@nestjs/common';

type PaymentCycleSummary = {
  start_date: string;
  end_date: string;
  status: string;
  remainingDue: number;
  payments: unknown[];
};

type UnpaidMonth = { cycle_start: string; cycle_end: string };

type TenantAllocation = { effective_from: Date; effective_to: Date | null; bed_price_snapshot: unknown };
type TenantRentCycle = { s_no: number; cycle_start: Date; cycle_end: Date; cycle_type?: string };
type RentPayment = { cycle_id?: number | null; status?: string | null; amount_paid?: unknown; actual_rent_amount?: unknown };

type TenantForSummary = {
  check_in_date: Date;
  check_out_date: Date | null;
  pg_locations?: { rent_cycle_type?: 'CALENDAR' | 'MIDMONTH' | null } | null;
  beds?: { bed_price?: unknown } | null;
  tenant_allocations?: TenantAllocation[];
  tenant_rent_cycles?: TenantRentCycle[];
  rent_payments?: RentPayment[];
};

type AllocationOverlap = { from: Date; to: Date | null; price: number };

type CycleSummaryRow = {
  cycle_id: number;
  start_date: string;
  end_date: string;
  payments: RentPayment[];
  totalPaid: number;
  due: number;
  remainingDue: number;
  status: 'NO_PAYMENT' | 'PAID' | 'PARTIAL' | 'PENDING' | 'FAILED';
  expected_from_allocations: number;
  due_from_payments: number;
};

@Injectable()
export class TenantRentSummaryService {
  buildRentSummary(params: {
    tenant: TenantForSummary;
  }): {
    payment_cycle_summaries: PaymentCycleSummary[];
    rent_cycle: unknown;
    payment_status: string;
    partial_payments: unknown[];
    total_partial_due: number;
    unpaid_months: UnpaidMonth[];
    partial_due_amount: number;
    pending_due_amount: number;
    rent_due_amount: number;
  } {
    const { tenant } = params;

    const moneyRound2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
    const dateOnly = (d: Date | string): string => {
      const dt = typeof d === 'string' ? new Date(d) : d;
      return dt.toISOString().split('T')[0];
    };

    const toDateOnlyUtc = (d: Date): Date => new Date(d.toISOString().split('T')[0] + 'T00:00:00.000Z');
    const getInclusiveDays = (start: Date, end: Date): number => {
      const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
      return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
    };

    const computeProratedAmountForMonth = (monthlyPrice: number, start: Date, end: Date): number => {
      if (monthlyPrice <= 0) return 0;
      const s = toDateOnlyUtc(start);
      const e = toDateOnlyUtc(end);
      const year = s.getUTCFullYear();
      const month = s.getUTCMonth();
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const daysInPeriod = getInclusiveDays(s, e);
      return (monthlyPrice / daysInMonth) * daysInPeriod;
    };

    const computeExpectedDueFromAllocations = (periodStart: Date, periodEnd: Date): number => {
      const allocations = tenant.tenant_allocations || [];
      if (!allocations || allocations.length === 0) return 0;

      const start = toDateOnlyUtc(periodStart);
      const end = toDateOnlyUtc(periodEnd);

      const overlaps = allocations
        .map((a: TenantAllocation) => ({
          from: toDateOnlyUtc(new Date(a.effective_from)),
          to: a.effective_to ? toDateOnlyUtc(new Date(a.effective_to)) : null,
          price: a.bed_price_snapshot ? Number(a.bed_price_snapshot) : 0,
        }))
        .filter((a: { from: Date; to: Date | null; price: number }) => {
          const aTo = a.to ?? end;
          return a.from <= end && aTo >= start;
        })
        .sort((a: { from: Date }, b: { from: Date }) => a.from.getTime() - b.from.getTime());

      if (overlaps.length === 0) return 0;

      let total = 0;
      overlaps.forEach((a: AllocationOverlap) => {
        const segStart = a.from > start ? a.from : start;
        const segEnd = (a.to ?? end) < end ? (a.to ?? end) : end;
        if (segStart > segEnd) return;

        let cursor = new Date(segStart);
        while (cursor <= segEnd) {
          const y = cursor.getUTCFullYear();
          const m = cursor.getUTCMonth();

          const monthStart = new Date(Date.UTC(y, m, 1));
          const monthEnd = new Date(Date.UTC(y, m + 1, 0));

          const partStart = cursor > monthStart ? cursor : monthStart;
          const partEnd = segEnd < monthEnd ? segEnd : monthEnd;

          total += computeProratedAmountForMonth(a.price, partStart, partEnd);

          const next = new Date(partEnd);
          next.setUTCDate(next.getUTCDate() + 1);
          cursor = next;
        }
      });

      return moneyRound2(total);
    };

    const computeCycleSummaries = () => {
      const cycles = tenant.tenant_rent_cycles || [];
      const payments = tenant.rent_payments || [];

      const paymentsByCycleId = new Map<number, RentPayment[]>();
      payments.forEach((p: RentPayment) => {
        if (!p.cycle_id) return;
        if (!paymentsByCycleId.has(p.cycle_id)) paymentsByCycleId.set(p.cycle_id, []);
        paymentsByCycleId.get(p.cycle_id)!.push(p);
      });

      const summaries: CycleSummaryRow[] = cycles
        .map((c: TenantRentCycle) => {
          const ps = paymentsByCycleId.get(c.s_no) || [];
          const payingRows = ps.filter((p: RentPayment) => p.status === 'PAID' || p.status === 'PARTIAL');
          const totalPaid = moneyRound2(payingRows.reduce((sum: number, p: RentPayment) => sum + Number(p.amount_paid || 0), 0));
          const dueFromPayments = moneyRound2(ps.reduce((max: number, p: RentPayment) => Math.max(max, Number(p.actual_rent_amount || 0)), 0));

          const expectedFromAllocations = computeExpectedDueFromAllocations(
            new Date(c.cycle_start),
            new Date(c.cycle_end),
          );

          const due = expectedFromAllocations > 0 ? expectedFromAllocations : dueFromPayments;
          const remainingDue = moneyRound2(Math.max(0, due - totalPaid));

          let status: 'NO_PAYMENT' | 'PAID' | 'PARTIAL' | 'PENDING' | 'FAILED' = 'NO_PAYMENT';
          if (due > 0) {
            if (totalPaid >= due) status = 'PAID';
            else if (totalPaid > 0) status = 'PARTIAL';
            else status = 'NO_PAYMENT';
          } else {
            if (totalPaid > 0) status = 'PARTIAL';
          }

          const startStr = dateOnly(new Date(c.cycle_start));
          const endStr = dateOnly(new Date(c.cycle_end));

          return {
            cycle_id: c.s_no,
            start_date: startStr,
            end_date: endStr,
            payments: ps,
            totalPaid,
            due,
            remainingDue,
            status,
            expected_from_allocations: expectedFromAllocations,
            due_from_payments: dueFromPayments,
          };
        })
        .sort((a: CycleSummaryRow, b: CycleSummaryRow) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());

      return summaries;
    };

    const getUnpaidMonthsWithCycleDates = (): Array<{
      cycle_id: number;
      cycle_start: string;
      cycle_end: string;
      month: string;
      month_name: string;
      year: number;
      month_number: number;
      cycle_type?: string;
    }> => {
      const formatDateOnly = (d: Date): string => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const now = new Date();
      now.setHours(0, 0, 0, 0);

      const checkInDate = new Date(tenant.check_in_date);
      const checkOutDate = tenant.check_out_date ? new Date(tenant.check_out_date) : null;
      const endDate = checkOutDate && checkOutDate < now ? checkOutDate : now;
      endDate.setHours(0, 0, 0, 0);

      const endCutoff = endDate;
      const cycles = (tenant.tenant_rent_cycles || [])
        .map((c: TenantRentCycle) => ({
          ...c,
          cycle_start: new Date(c.cycle_start),
          cycle_end: new Date(c.cycle_end),
        }))
        .filter((c: TenantRentCycle) => c.cycle_start <= endCutoff)
        .sort((a: TenantRentCycle, b: TenantRentCycle) => a.cycle_start.getTime() - b.cycle_start.getTime());

      const paidByCycle = new Map<number, number>();
      (tenant.rent_payments || []).forEach((p: RentPayment) => {
        if (!p.cycle_id) return;
        const isPaying = p.status === 'PAID' || p.status === 'PARTIAL';
        if (!isPaying) return;
        const prev = paidByCycle.get(p.cycle_id) || 0;
        paidByCycle.set(p.cycle_id, prev + Number(p.amount_paid || 0));
      });

      const unpaidMonths: Array<{
        cycle_id: number;
        cycle_start: string;
        cycle_end: string;
        month: string;
        month_name: string;
        year: number;
        month_number: number;
        cycle_type?: string;
      }> = [];

      cycles.forEach((c: TenantRentCycle) => {
        const totalPaid = paidByCycle.get(c.s_no) || 0;
        if (totalPaid <= 0) {
          unpaidMonths.push({
            cycle_id: c.s_no,
            cycle_start: formatDateOnly(c.cycle_start),
            cycle_end: formatDateOnly(c.cycle_end),
            month: `${c.cycle_start.getFullYear()}-${String(c.cycle_start.getMonth() + 1).padStart(2, '0')}`,
            month_name: c.cycle_start.toLocaleString('default', { month: 'long', year: 'numeric' }),
            year: c.cycle_start.getFullYear(),
            month_number: c.cycle_start.getMonth() + 1,
            cycle_type: c.cycle_type,
          });
        }
      });

      // If tenant checked in after endCutoff, return empty
      if (checkInDate > endCutoff) return [];

      return unpaidMonths;
    };

    const cycleSummaries = computeCycleSummaries();

    let currentRentCycle = null;
    if (tenant.pg_locations) {
      const cycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';

      const todayUtc = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
      const checkInUtc = new Date(new Date(tenant.check_in_date).toISOString().split('T')[0] + 'T00:00:00.000Z');
      const anchorDay = checkInUtc.getUTCDate();

      const makeUtcDateClamped = (y: number, m: number, d: number): Date => {
        const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        const day = Math.min(Math.max(1, d), lastDay);
        return new Date(Date.UTC(y, m, day));
      };

      let cycleStart: Date;
      let cycleEnd: Date;

      if (cycleType === 'CALENDAR') {
        const isCheckInMonth =
          todayUtc.getUTCFullYear() === checkInUtc.getUTCFullYear() && todayUtc.getUTCMonth() === checkInUtc.getUTCMonth();
        cycleStart = isCheckInMonth ? checkInUtc : new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), 1));
        cycleEnd = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() + 1, 0));
      } else {
        const refY = todayUtc.getUTCFullYear();
        const refM = todayUtc.getUTCMonth();
        const refD = todayUtc.getUTCDate();

        const startMonth = refD >= anchorDay ? refM : refM - 1;
        cycleStart = makeUtcDateClamped(refY, startMonth, anchorDay);

        const nextStart = makeUtcDateClamped(
          cycleStart.getUTCFullYear(),
          cycleStart.getUTCMonth() + 1,
          anchorDay,
        );
        cycleEnd = new Date(nextStart);
        cycleEnd.setUTCDate(cycleEnd.getUTCDate() - 1);
      }

      const startStr = cycleStart.toISOString().split('T')[0];
      const endStr = cycleEnd.toISOString().split('T')[0];
      const daysInPeriod = cycleStart && cycleEnd
        ? Math.max(1, Math.floor((Date.UTC(cycleEnd.getUTCFullYear(), cycleEnd.getUTCMonth(), cycleEnd.getUTCDate()) - Date.UTC(cycleStart.getUTCFullYear(), cycleStart.getUTCMonth(), cycleStart.getUTCDate())) / (1000 * 60 * 60 * 24)) + 1)
        : 0;

      currentRentCycle = {
        start_date: startStr,
        end_date: endStr,
        days: daysInPeriod,
        cycle_type: cycleType,
      };
    }

    const unpaidMonths = getUnpaidMonthsWithCycleDates();

    const todayDateOnlyUtc = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
    const relevantCycle =
      (cycleSummaries as PaymentCycleSummary[]).find((c: PaymentCycleSummary) => {
        const start = new Date(String(c.start_date) + 'T00:00:00.000Z');
        const end = new Date(String(c.end_date) + 'T00:00:00.000Z');
        return start <= todayDateOnlyUtc && todayDateOnlyUtc <= end;
      }) ||
      (cycleSummaries as PaymentCycleSummary[]).find((c: PaymentCycleSummary) => {
        const start = new Date(String(c.start_date) + 'T00:00:00.000Z');
        return start <= todayDateOnlyUtc;
      }) ||
      null;

    const payment_status = (relevantCycle as PaymentCycleSummary | null)?.status || 'NO_PAYMENT';

    const underpaidCycles = (cycleSummaries as PaymentCycleSummary[]).filter((s: PaymentCycleSummary) => s.status === 'PARTIAL' && s.remainingDue > 0);
    const partial_payments = underpaidCycles.flatMap((s: PaymentCycleSummary) => s.payments);
    const total_partial_due = moneyRound2(underpaidCycles.reduce((sum: number, s: PaymentCycleSummary) => sum + Number(s.remainingDue || 0), 0));

    const bedPriceNumber = tenant.beds?.bed_price ? Number(tenant.beds.bed_price) : 0;

    const pending_due_amount = moneyRound2(
      (unpaidMonths as UnpaidMonth[]).reduce((sum: number, m: UnpaidMonth) => {
        const start = new Date(`${m.cycle_start}T00:00:00.000Z`);
        const end = new Date(`${m.cycle_end}T00:00:00.000Z`);

        const dueFromAllocations = computeExpectedDueFromAllocations(start, end);
        if (dueFromAllocations > 0) return sum + dueFromAllocations;

        const daysInPeriod = getInclusiveDays(start, end);
        const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
        const legacy = bedPriceNumber > 0 ? (bedPriceNumber / daysInMonth) * daysInPeriod : 0;
        return sum + legacy;
      }, 0),
    );

    const partial_due_amount = moneyRound2(total_partial_due);
    const rent_due_amount = moneyRound2(partial_due_amount + pending_due_amount);

    return {
      payment_cycle_summaries: cycleSummaries,
      rent_cycle: currentRentCycle,
      payment_status,
      partial_payments,
      total_partial_due,
      unpaid_months: unpaidMonths,
      partial_due_amount,
      pending_due_amount,
      rent_due_amount,
    };
  }
}
