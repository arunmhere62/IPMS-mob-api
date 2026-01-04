import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type MonthWindow = { monthStart: Date; monthEnd: Date };

type MonthlyMetrics = {
  month_start: string;
  month_end: string;
  cash_received: number;
  refunds_paid: number;
  rent_earned: number;
  mrr_value: number;
};

type AllocationForPricing = { effective_from: Date; effective_to: Date | null; bed_price_snapshot: unknown };

type CycleWithTenant = {
  cycle_start: Date;
  cycle_end: Date;
  tenant_id: number;
  tenants: {
    tenant_allocations: AllocationForPricing[];
  };
};

@Injectable()
export class DashboardMonthlyMetricsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getMonthlyMetrics(params: { pg_id: number; monthStart: Date; monthEnd: Date }): Promise<MonthlyMetrics> {
    const { monthStart, monthEnd } = this.toMonthlyWindow({ monthStart: params.monthStart, monthEnd: params.monthEnd });

    const [rentAgg, refundAgg, allocationsAgg, cycles] = await Promise.all([
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

    const cashReceived = this.moneyRound2(Number(rentAgg._sum.amount_paid || 0));
    const refundsPaid = this.moneyRound2(Number(refundAgg._sum.amount_paid || 0));
    const mrrValue = this.moneyRound2(Number(allocationsAgg._sum.bed_price_snapshot || 0));

    const monthStartUtc = this.toDateOnlyUtc(monthStart);
    const monthEndExclusiveUtc = this.toDateOnlyUtc(monthEnd);
    const monthEndInclusiveUtc = new Date(monthEndExclusiveUtc);
    monthEndInclusiveUtc.setUTCDate(monthEndInclusiveUtc.getUTCDate() - 1);

    const rentEarned = this.moneyRound2(
      (cycles as unknown as CycleWithTenant[]).reduce((sum: number, c) => {
        const cycleStartUtc = this.toDateOnlyUtc(c.cycle_start);
        const cycleEndUtc = this.toDateOnlyUtc(c.cycle_end);

        const overlapStart = cycleStartUtc > monthStartUtc ? cycleStartUtc : monthStartUtc;
        const overlapEnd = cycleEndUtc < monthEndInclusiveUtc ? cycleEndUtc : monthEndInclusiveUtc;

        if (overlapStart > overlapEnd) return sum;

        const overlapDays = this.getInclusiveDays(overlapStart, overlapEnd);
        const totalCycleDays = this.getInclusiveDays(cycleStartUtc, cycleEndUtc);
        if (totalCycleDays <= 0) return sum;

        const monthlyPrice = this.pickMonthlyPriceForCycle({
          allocations: c.tenants?.tenant_allocations || [],
          cycleStart: c.cycle_start,
        });

        const earned = (monthlyPrice * overlapDays) / totalCycleDays;
        return sum + earned;
      }, 0),
    );

    return {
      month_start: monthStart.toISOString(),
      month_end: monthEnd.toISOString(),
      cash_received: cashReceived,
      refunds_paid: refundsPaid,
      rent_earned: rentEarned,
      mrr_value: mrrValue,
    };
  }

  async getThisMonthMetrics(params: { pg_id: number; now?: Date }): Promise<MonthlyMetrics> {
    const now = params.now ?? new Date();
    const { monthStart, monthEnd } = this.monthWindowForNow(now);
    return this.getMonthlyMetrics({ pg_id: params.pg_id, monthStart, monthEnd });
  }
}
