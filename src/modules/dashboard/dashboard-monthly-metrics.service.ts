import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type MonthWindow = { monthStart: Date; monthEnd: Date };

type MonthlyMetrics = {
  month_start: string;
  month_end: string;
  cash_received: number;
  refunds_paid: number;
  advance_paid: number;
  expenses_paid: number;
  rent_earned: number;
  mrr_value: number;
  rent_earned_breakdown: {
    formula: string;
    cycles: Array<{
      tenant_id: number;
      cycle_start: string;
      cycle_end: string;
      overlap_start: string;
      overlap_end: string;
      overlap_days: number;
      total_cycle_days: number;
      monthly_price: number;
      segments?: Array<{
        start: string;
        end: string;
        days: number;
        price: number;
        earned: number;
      }>;
      earned: number;
    }>;
  };
};

type AllocationForPricing = { effective_from: Date; effective_to: Date | null; bed_price_snapshot: unknown };

type CycleWithTenant = {
  cycle_start: Date;
  cycle_end: Date;
  cycle_type?: 'CALENDAR' | 'MIDMONTH' | string;
  tenant_id: number;
  tenants: {
    tenant_allocations: AllocationForPricing[];
  };
};

@Injectable()
export class DashboardMonthlyMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  private toDateOnlyIso(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private toDateOnlyUtc(d: Date): Date {
    return new Date(d.toISOString().split('T')[0] + 'T00:00:00.000Z');
  }

  private getInclusiveDays(start: Date, end: Date): number {
    const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    return Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
  }

  private moneyRound2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private sumOrZero(agg: { _sum?: Record<string, unknown> } | null | undefined, key: string): number {
    const n = Number(agg?._sum?.[key] ?? 0);
    return this.moneyRound2(n);
  }

  private monthWindowForNow(now: Date): MonthWindow {
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
    const monthEnd = new Date(y, m + 1, 1, 0, 0, 0, 0);
    return { monthStart, monthEnd };
  }

  private toMonthlyWindow(params: { monthStart: Date; monthEnd: Date }): MonthWindow {
    const monthStart = new Date(params.monthStart);
    const monthEnd = new Date(params.monthEnd);
    return { monthStart, monthEnd };
  }

  private pickMonthlyPriceForCycle(params: { allocations: AllocationForPricing[]; cycleStart: Date }): number {
    const cycleStartUtc = this.toDateOnlyUtc(params.cycleStart);

    const matching = (params.allocations || []).find((a) => {
      const from = this.toDateOnlyUtc(a.effective_from);
      const to = a.effective_to ? this.toDateOnlyUtc(a.effective_to) : null;
      if (from > cycleStartUtc) return false;
      if (to && to < cycleStartUtc) return false;
      return true;
    });

    if (!matching) return 0;
    return Number(matching.bed_price_snapshot || 0);
  }

  private computeEarnedForOverlap(params: {
    allocations: AllocationForPricing[];
    overlapStartUtc: Date;
    overlapEndUtc: Date;
    denominatorDays: number;
  }): { earned: number; segments: Array<{ start: string; end: string; days: number; price: number; earned: number }> } {
    const allocations = (params.allocations || [])
      .map((a) => ({
        from: this.toDateOnlyUtc(a.effective_from),
        to: a.effective_to ? this.toDateOnlyUtc(a.effective_to) : null,
        price: Number(a.bed_price_snapshot || 0),
      }))
      .sort((x, y) => x.from.getTime() - y.from.getTime());

    const segments: Array<{ start: string; end: string; days: number; price: number; earned: number }> = [];
    let total = 0;

    for (const a of allocations) {
      const segStart = a.from > params.overlapStartUtc ? a.from : params.overlapStartUtc;
      const segEnd = a.to && a.to < params.overlapEndUtc ? a.to : params.overlapEndUtc;
      if (segStart > segEnd) continue;
      if (params.denominatorDays <= 0) continue;

      const days = this.getInclusiveDays(segStart, segEnd);
      const earned = (a.price * days) / params.denominatorDays;
      total += earned;
      segments.push({
        start: this.toDateOnlyIso(segStart),
        end: this.toDateOnlyIso(segEnd),
        days,
        price: this.moneyRound2(a.price),
        earned: this.moneyRound2(earned),
      });
    }

    return { earned: this.moneyRound2(total), segments };
  }

  async getMonthlyMetrics(params: { pg_id: number; monthStart: Date; monthEnd: Date }): Promise<MonthlyMetrics> {
    const { monthStart, monthEnd } = this.toMonthlyWindow({ monthStart: params.monthStart, monthEnd: params.monthEnd });

    const [rentAgg, refundAgg, advanceAgg, expensesAgg, allocationsAgg, cycles] = await Promise.all([
      this.prisma.rent_payments.aggregate({
        where: {
          pg_id: params.pg_id,
          payment_date: { gte: monthStart, lt: monthEnd },
          status: { in: ['PAID', 'PARTIAL'] },
          OR: [{ is_deleted: false }, { is_deleted: null }],
        },
        _sum: { amount_paid: true },
      }),
      this.prisma.refund_payments.aggregate({
        where: {
          pg_id: params.pg_id,
          payment_date: { gte: monthStart, lt: monthEnd },
          OR: [{ is_deleted: false }, { is_deleted: null }],
        },
        _sum: { amount_paid: true },
      }),
      this.prisma.advance_payments.aggregate({
        where: {
          pg_id: params.pg_id,
          payment_date: { gte: monthStart, lt: monthEnd },
          status: 'PAID',
          OR: [{ is_deleted: false }, { is_deleted: null }],
        },
        _sum: { amount_paid: true },
      }),
      this.prisma.expenses.aggregate({
        where: {
          pg_id: params.pg_id,
          paid_date: { gte: monthStart, lt: monthEnd },
          OR: [{ is_deleted: false }, { is_deleted: null }],
        },
        _sum: { amount: true },
      }),
      this.prisma.tenant_allocations.aggregate({
        where: {
          pg_id: params.pg_id,
          effective_from: { lt: monthEnd },
          OR: [{ effective_to: null }, { effective_to: { gte: monthStart } }],
          tenants: {
            is_deleted: false,
            status: 'ACTIVE',
          },
        },
        _sum: { bed_price_snapshot: true },
      }),
      this.prisma.tenant_rent_cycles.findMany({
        where: {
          cycle_start: { lt: monthEnd },
          cycle_end: { gte: monthStart },
          tenants: {
            is_deleted: false,
            status: 'ACTIVE',
            pg_id: params.pg_id,
          },
        },
        select: {
          tenant_id: true,
          cycle_type: true,
          cycle_start: true,
          cycle_end: true,
          tenants: {
            select: {
              tenant_allocations: {
                select: {
                  effective_from: true,
                  effective_to: true,
                  bed_price_snapshot: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const cashReceived = this.sumOrZero(rentAgg, 'amount_paid');
    const refundsPaid = this.sumOrZero(refundAgg, 'amount_paid');
    const advancePaid = this.sumOrZero(advanceAgg, 'amount_paid');
    const expensesPaid = this.sumOrZero(expensesAgg, 'amount');
    const mrrValue = this.sumOrZero(allocationsAgg, 'bed_price_snapshot');

    const monthStartUtc = this.toDateOnlyUtc(monthStart);
    const monthEndExclusiveUtc = this.toDateOnlyUtc(monthEnd);
    const monthEndInclusiveUtc = new Date(monthEndExclusiveUtc);
    monthEndInclusiveUtc.setUTCDate(monthEndInclusiveUtc.getUTCDate() - 1);

    const daysInSelectedMonth = this.getInclusiveDays(monthStartUtc, monthEndInclusiveUtc);

    const breakdownCycles: MonthlyMetrics['rent_earned_breakdown']['cycles'] = [];

    const rentEarned = this.moneyRound2(
      (cycles as unknown as CycleWithTenant[]).reduce((sum: number, c) => {
        const cycleStartUtc = this.toDateOnlyUtc(c.cycle_start);
        const cycleEndUtc = this.toDateOnlyUtc(c.cycle_end);

        const overlapStart = cycleStartUtc > monthStartUtc ? cycleStartUtc : monthStartUtc;
        const overlapEnd = cycleEndUtc < monthEndInclusiveUtc ? cycleEndUtc : monthEndInclusiveUtc;

        if (overlapStart > overlapEnd) return sum;

        const overlapDays = this.getInclusiveDays(overlapStart, overlapEnd);
        const cycleType = String(c.cycle_type || '').toUpperCase();
        const denominatorDays = cycleType === 'CALENDAR' ? daysInSelectedMonth : this.getInclusiveDays(cycleStartUtc, cycleEndUtc);
        if (denominatorDays <= 0) return sum;

        const computed = this.computeEarnedForOverlap({
          allocations: c.tenants?.tenant_allocations || [],
          overlapStartUtc: overlapStart,
          overlapEndUtc: overlapEnd,
          denominatorDays,
        });

        const monthlyPrice = this.pickMonthlyPriceForCycle({
          allocations: c.tenants?.tenant_allocations || [],
          cycleStart: c.cycle_start,
        });

        const earned = computed.earned;

        breakdownCycles.push({
          tenant_id: c.tenant_id,
          cycle_start: this.toDateOnlyIso(cycleStartUtc),
          cycle_end: this.toDateOnlyIso(cycleEndUtc),
          overlap_start: this.toDateOnlyIso(overlapStart),
          overlap_end: this.toDateOnlyIso(overlapEnd),
          overlap_days: overlapDays,
          total_cycle_days: denominatorDays,
          monthly_price: this.moneyRound2(monthlyPrice),
          segments: computed.segments,
          earned: this.moneyRound2(earned),
        });

        return sum + earned;
      }, 0),
    );

    return {
      month_start: monthStart.toISOString(),
      month_end: monthEnd.toISOString(),
      cash_received: cashReceived,
      refunds_paid: refundsPaid,
      advance_paid: advancePaid,
      expenses_paid: expensesPaid,
      rent_earned: rentEarned,
      mrr_value: mrrValue,
      rent_earned_breakdown: {
        formula: 'rent_earned = Σ( monthly_price × (overlap_days_in_month ÷ total_cycle_days) )',
        cycles: breakdownCycles,
      },
    };
  }

  async getThisMonthMetrics(params: { pg_id: number; now?: Date }): Promise<MonthlyMetrics> {
    const now = params.now ?? new Date();
    const { monthStart, monthEnd } = this.monthWindowForNow(now);
    return this.getMonthlyMetrics({ pg_id: params.pg_id, monthStart, monthEnd });
  }
}
