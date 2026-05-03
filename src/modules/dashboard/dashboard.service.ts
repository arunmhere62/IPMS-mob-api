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

            rent_cycle_start: true,

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

        rent_payments: {

          where: {

            is_deleted: false,

            status: {

              not: 'VOIDED',

            },

          },

          orderBy: {

            payment_date: 'asc',

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



    // Enrich with rent summary calculation

    const enrichedTenants = (tenants || []).map((tenant) => {

      const rentSummary = this.tenantRentSummaryService.buildRentSummary({ tenant });

      const rentFlags = this.tenantStatusService.deriveRentFlags({

        paymentStatus: rentSummary.payment_status,

        unpaidMonthsCount: rentSummary.unpaid_months?.length || 0,

        partialDueAmount: rentSummary.partial_due_amount || 0,

      });

      const statusEnriched = this.tenantStatusService.enrichTenantsWithStatus([tenant])[0] as Record<string, unknown>;

      // Strip heavy/sensitive fields not needed by dashboard widgets
      const {
        proof_documents, profile_photo, id_proof, images,
        rent_payments, advance_payments, refund_payments,
        ...slimStatus
      } = statusEnriched as Record<string, unknown> & {
        proof_documents?: unknown; profile_photo?: unknown; id_proof?: unknown; images?: unknown;
        rent_payments?: unknown; advance_payments?: unknown; refund_payments?: unknown;
      };
      void proof_documents; void profile_photo; void id_proof; void images;
      void rent_payments; void advance_payments; void refund_payments;

      return {

        ...slimStatus,

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



    const pendingRentTenantsEnriched = this.tenantStatusService.getTenantsWithPendingRent(enrichedTenants as unknown[]);

    const partialRentTenantsEnriched = this.tenantStatusService.getTenantsWithPartialRent(enrichedTenants as unknown[]);

    const tenantsWithoutAdvanceEnriched = this.tenantStatusService.getTenantsWithoutAdvance(enrichedTenants as unknown[]);



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

