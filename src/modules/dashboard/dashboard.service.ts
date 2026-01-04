import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { TenantStatusService } from '../tenant/tenant-status/tenant-status.service';
import { TenantPaymentService } from '../tenant/tenant-payment/rent-payment.service';
import { TenantRentSummaryService } from '../tenant/tenant-rent-summary.service';
import { DashboardTenantStatusService } from './dashboard-tenant-status.service';
import { DashboardMonthlyMetricsService } from './dashboard-monthly-metrics.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantStatusService: TenantStatusService,
    private readonly tenantPaymentService: TenantPaymentService,
    private readonly tenantRentSummaryService: TenantRentSummaryService,
    private readonly dashboardTenantStatusService: DashboardTenantStatusService,
    private readonly dashboardMonthlyMetricsService: DashboardMonthlyMetricsService,
  ) {}

  async getDashboardMonthlyMetrics(params: { pg_id: number; monthStart?: string; monthEnd?: string }) {
    if ((params.monthStart && !params.monthEnd) || (!params.monthStart && params.monthEnd)) {
      throw new BadRequestException('Both monthStart and monthEnd must be provided together');
    }

    if (params.monthStart && params.monthEnd) {
      const ms = new Date(params.monthStart);
      const me = new Date(params.monthEnd);
      if (Number.isNaN(ms.getTime()) || Number.isNaN(me.getTime())) {
        throw new BadRequestException('Invalid monthStart/monthEnd format');
      }
      if (me <= ms) {
        throw new BadRequestException('monthEnd must be after monthStart');
      }

      const monthly_metrics = await this.dashboardMonthlyMetricsService.getMonthlyMetrics({
        pg_id: params.pg_id,
        monthStart: ms,
        monthEnd: me,
      });

      return ResponseUtil.success(
        {
          pg_id: params.pg_id,
          monthly_metrics,
        },
        'Dashboard monthly metrics fetched successfully',
      );
    }

    const monthly_metrics = await this.dashboardMonthlyMetricsService.getThisMonthMetrics({ pg_id: params.pg_id });

    return ResponseUtil.success(
      {
        pg_id: params.pg_id,
        monthly_metrics,
      },
      'Dashboard monthly metrics fetched successfully',
    );
  }

  async getBedMetrics(params: { pg_id: number }): Promise<{
    pg_id: number;
    total_beds: number;
    total_pg_value: number;
    occupied_beds: number;
    occupancy_rate: number;
  }> {
    const [bedsAgg, occupiedBeds] = await Promise.all([
      this.prisma.beds.aggregate({
        where: {
          is_deleted: false,
          pg_id: params.pg_id,
        },
        _count: {
          s_no: true,
        },
        _sum: {
          bed_price: true,
        },
      }),
      this.prisma.tenants.count({
        where: {
          is_deleted: false,
          pg_id: params.pg_id,
          status: 'ACTIVE',
          bed_id: {
            not: null,
          },
        },
      }),
    ]);

    const totalBeds = bedsAgg._count.s_no;
    const totalPgValue = Number(bedsAgg._sum.bed_price ?? 0);
    const occ = occupiedBeds;
    const occupancyRate = totalBeds > 0 ? (occ / totalBeds) * 100 : 0;

    return {
      pg_id: params.pg_id,
      total_beds: totalBeds,
      total_pg_value: totalPgValue,
      occupied_beds: occ,
      occupancy_rate: occupancyRate,
    };
  }

  async getTenantStatusWidgets(params: { pg_id: number }) {
    const tenants = await this.prisma.tenants.findMany({
      where: {
        is_deleted: false,
        pg_id: params.pg_id,
        status: {
          in: ['ACTIVE', 'INACTIVE'],
        },
      },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
            rent_cycle_type: true,
          },
        },
        rooms: {
          select: {
            s_no: true,
            room_no: true,
          },
        },
        beds: {
          select: {
            s_no: true,
            bed_no: true,
            bed_price: true,
          },
        },
        tenant_rent_cycles: {
          orderBy: {
            cycle_start: 'asc',
          },
          select: {
            s_no: true,
            cycle_type: true,
            anchor_day: true,
            cycle_start: true,
            cycle_end: true,
          },
        },
        rent_payments: {
          where: {
            is_deleted: false,
            status: {
              not: 'VOIDED',
            },
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            s_no: true,
            payment_date: true,
            amount_paid: true,
            actual_rent_amount: true,
            cycle_id: true,
            payment_method: true,
            status: true,
            remarks: true,
          },
        },
        advance_payments: {
          where: {
            is_deleted: false,
            status: {
              not: 'VOIDED',
            },
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            s_no: true,
            payment_date: true,
            amount_paid: true,
            actual_rent_amount: true,
            payment_method: true,
            status: true,
            remarks: true,
          },
        },
        refund_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            s_no: true,
            amount_paid: true,
            payment_method: true,
            payment_date: true,
            status: true,
            remarks: true,
            actual_rent_amount: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Enrich with the same rent summary used by the tenant list API, so dashboard
    // counts reflect mixed cases (partial + pending) correctly.
    const enrichedTenants = (tenants || []).map((tenant) => {
      const rentSummary = this.tenantRentSummaryService.buildRentSummary({ tenant });
      const rentFlags = this.tenantStatusService.deriveRentFlags({
        paymentStatus: rentSummary.payment_status,
        unpaidMonthsCount: rentSummary.unpaid_months?.length || 0,
        partialDueAmount: rentSummary.partial_due_amount || 0,
      });

      return {
        ...(tenant as unknown as Record<string, unknown>),
        is_rent_paid: rentFlags.is_rent_paid,
        is_rent_partial: rentFlags.is_rent_partial,
        rent_due_amount: rentSummary.rent_due_amount,
        partial_due_amount: rentSummary.partial_due_amount,
        pending_due_amount: rentSummary.pending_due_amount,
        unpaid_months: rentSummary.unpaid_months,
        payment_status: rentSummary.payment_status,
        payment_cycle_summaries: rentSummary.payment_cycle_summaries,
      };
    });

    const { pendingRentTenants, partialRentTenants } = this.dashboardTenantStatusService.classify({
      tenants: enrichedTenants as unknown[],
    });

    const tenantsWithoutAdvance = enrichedTenants.filter((t) => {
      const status = String((t as { status?: unknown })?.status || '');
      if (status !== 'ACTIVE') return false;
      const adv = ((t as { advance_payments?: Array<{ status?: string }> })?.advance_payments || []) as Array<{
        status?: string;
      }>;
      return !adv.some((p) => p.status === 'PAID');
    });

    const tenantIdsForGaps = Array.from(
      new Set(
        ([] as unknown[])
          .concat(pendingRentTenants as unknown[], partialRentTenants as unknown[], tenantsWithoutAdvance as unknown[])
          .map((t) => Number((t as { s_no?: unknown })?.s_no))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );

    const gapsByTenantId = await this.tenantPaymentService.detectPaymentGapsBulk(tenantIdsForGaps, { concurrency: 5 });

    const enrichTenants = (list: unknown[]) => {
      return (list || []).map((t) => {
        const id = Number((t as { s_no?: unknown })?.s_no);
        const gap = Number.isFinite(id) && id > 0 ? gapsByTenantId[id] : undefined;
        const gaps = (gap?.gaps ?? []) as Array<{ rentDue?: unknown; totalPaid?: unknown; remainingDue?: unknown }>;

        const classified = gaps.reduce(
          (
            acc: {
              pending: Array<{ rentDue?: unknown; totalPaid?: unknown; remainingDue?: unknown }>;
              partial: Array<{ rentDue?: unknown; totalPaid?: unknown; remainingDue?: unknown }>;
            },
            g,
          ) => {
            const kind = this.tenantStatusService.classifyGap({
              rentDue: Number(g?.rentDue || 0),
              totalPaid: Number(g?.totalPaid || 0),
              remainingDue: Number(g?.remainingDue || 0),
            });
            if (kind === 'PARTIAL') acc.partial.push(g);
            else if (kind === 'PENDING') acc.pending.push(g);
            return acc;
          },
          { pending: [], partial: [] },
        );

        const pendingGapDueAmount = classified.pending.reduce((sum: number, g) => sum + Number(g?.remainingDue || 0), 0);
        const partialGapDueAmount = classified.partial.reduce((sum: number, g) => sum + Number(g?.remainingDue || 0), 0);
        const gapDueAmount = pendingGapDueAmount + partialGapDueAmount;

        return {
          ...(t as Record<string, unknown>),
          gap_count: gap?.gapCount ?? 0,
          gaps,
          pending_gap_count: classified.pending.length,
          pending_gaps: classified.pending,
          pending_gap_due_amount: Math.round((pendingGapDueAmount + Number.EPSILON) * 100) / 100,
          partial_gap_count: classified.partial.length,
          partial_gaps: classified.partial,
          partial_gap_due_amount: Math.round((partialGapDueAmount + Number.EPSILON) * 100) / 100,
          gap_due_amount: Math.round((gapDueAmount + Number.EPSILON) * 100) / 100,
        };
      });
    };

    const pendingRentTenantsEnriched = enrichTenants(pendingRentTenants as unknown[]);
    const partialRentTenantsEnriched = enrichTenants(partialRentTenants as unknown[]);
    const tenantsWithoutAdvanceEnriched = enrichTenants(tenantsWithoutAdvance as unknown[]);

    return {
      pg_id: params.pg_id,
      pending_rent: {
        count: pendingRentTenantsEnriched.length,
        tenants: pendingRentTenantsEnriched,
      },
      partial_rent: {
        count: partialRentTenantsEnriched.length,
        tenants: partialRentTenantsEnriched,
      },
      without_advance: {
        count: tenantsWithoutAdvanceEnriched.length,
        tenants: tenantsWithoutAdvanceEnriched,
      },
    };
  }

  async getDashboardSummary(params: { pg_id: number }) {
    const [bed_metrics, tenant_status] = await Promise.all([
      this.getBedMetrics({ pg_id: params.pg_id }),
      this.getTenantStatusWidgets({ pg_id: params.pg_id }),
    ]);

    return ResponseUtil.success(
      {
        pg_id: params.pg_id,
        bed_metrics,
        tenant_status,
      },
      'Dashboard summary fetched successfully',
    );
  }
}
