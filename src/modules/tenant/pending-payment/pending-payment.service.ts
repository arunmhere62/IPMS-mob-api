import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantStatusService } from '../tenant-status/tenant-status.service';
import { Prisma } from '@prisma/client';

type TenantWithPendingPaymentData = Prisma.tenantsGetPayload<{
  include: {
    rooms: { select: { room_no: true } };
    beds: { select: { bed_price: true } };
    tenant_allocations: {
      orderBy: { effective_from: 'asc' };
      select: {
        effective_from: true;
        effective_to: true;
        bed_price_snapshot: true;
      };
    };
    rent_payments: {
      where: { is_deleted: false };
      orderBy: { payment_date: 'desc' };
      select: {
        payment_date: true;
        amount_paid: true;
        actual_rent_amount: true;
        tenant_rent_cycles: { select: { cycle_start: true; cycle_end: true } };
      };
    };
  };
}>;

type TenantForPendingPaymentsList = Prisma.tenantsGetPayload<{
  include: {
    pg_locations: {
      select: {
        s_no: true;
        location_name: true;
        address: true;
      };
    };
    rooms: { select: { s_no: true; room_no: true } };
    beds: { select: { s_no: true; bed_no: true; bed_price: true } };
    rent_payments: {
      where: { is_deleted: false };
      orderBy: { payment_date: 'desc' };
      select: {
        s_no: true;
        payment_date: true;
        amount_paid: true;
        actual_rent_amount: true;
        payment_method: true;
        status: true;
        remarks: true;
        tenant_rent_cycles: { select: { cycle_start: true; cycle_end: true } };
      };
    };
    advance_payments: {
      where: { is_deleted: false };
      orderBy: { payment_date: 'desc' };
      select: {
        s_no: true;
        payment_date: true;
        amount_paid: true;
        actual_rent_amount: true;
        payment_method: true;
        status: true;
        remarks: true;
      };
    };
    refund_payments: {
      where: { is_deleted: false };
      orderBy: { payment_date: 'desc' };
      select: {
        s_no: true;
        amount_paid: true;
        payment_method: true;
        payment_date: true;
        status: true;
        remarks: true;
        actual_rent_amount: true;
      };
    };
  };
}>;

export interface PendingPaymentDetails {
  tenant_id: number;
  tenant_name: string;
  room_no?: string;
  total_pending: number;
  current_month_pending: number;
  overdue_months: number;
  payment_status: 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE';
  last_payment_date?: string;
  next_due_date?: string;
  monthly_rent: number;
  pending_months: Array<{
    month: string;
    year: number;
    expected_amount: number;
    paid_amount: number;
    balance: number;
    due_date: string;
    is_overdue: boolean;
  }>;
}

@Injectable()
export class PendingPaymentService {
  constructor(
    private prisma: PrismaService,
    private tenantStatusService: TenantStatusService,
  ) {}

  /**
   * Calculate pending payments for a specific tenant
   * Logic:
   * 1. If tenant is ACTIVE and has NO payments → Pending (full monthly rent)
   * 2. If last payment end_date has passed → Pending for new period
   * 3. If paid partial amount → Show balance
   */
  async calculateTenantPendingPayment(
    tenantId: number,
  ): Promise<PendingPaymentDetails> {
    // Get tenant details with room and payments
    const tenant: TenantWithPendingPaymentData | null = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
      include: {
        rooms: {
          select: {
            room_no: true,
          },
        },
        beds: {
          select: {
            bed_price: true,
          },
        },
        tenant_allocations: {
          orderBy: {
            effective_from: 'asc',
          },
          select: {
            effective_from: true,
            effective_to: true,
            bed_price_snapshot: true,
          },
        },
        rent_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            payment_date: true,
            amount_paid: true,
            actual_rent_amount: true,
            tenant_rent_cycles: {
              select: {
                cycle_start: true,
                cycle_end: true,
              },
            },
          },
        },
      },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // If tenant is not ACTIVE, no pending payment
    if (tenant.status !== 'ACTIVE') {
      return {
        tenant_id: tenant.s_no,
        tenant_name: tenant.name,
        room_no: tenant.rooms?.room_no,
        total_pending: 0,
        current_month_pending: 0,
        overdue_months: 0,
        payment_status: 'PAID',
        monthly_rent: tenant.beds?.bed_price ? parseFloat(tenant.beds.bed_price.toString()) : 0,
        pending_months: [],
      };
    }

    const moneyRound2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
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

    const computeProratedDueFromAllocations = (periodStart: Date, periodEnd: Date): number => {
      const allocations: Array<{
        effective_from: Date;
        effective_to: Date | null;
        bed_price_snapshot: unknown;
      }> = (tenant?.tenant_allocations as Array<{
        effective_from: Date;
        effective_to: Date | null;
        bed_price_snapshot: unknown;
      }> | undefined) ?? [];
      if (!allocations || allocations.length === 0) return 0;

      const start = toDateOnlyUtc(periodStart);
      const end = toDateOnlyUtc(periodEnd);

      const overlaps = allocations
        .map((a) => ({
          from: toDateOnlyUtc(new Date(a.effective_from)),
          to: a.effective_to ? toDateOnlyUtc(new Date(a.effective_to)) : null,
          price: a.bed_price_snapshot ? Number(a.bed_price_snapshot) : 0,
        }))
        .filter((a) => {
          const aTo = a.to ?? end;
          return a.from <= end && aTo >= start;
        })
        .sort((a, b) => a.from.getTime() - b.from.getTime());

      if (overlaps.length === 0) return 0;

      let total = 0;
      overlaps.forEach((a) => {
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

    const bedPriceNumber = tenant.beds?.bed_price ? parseFloat(tenant.beds.bed_price.toString()) : 0;
    const monthlyRent = bedPriceNumber;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastPayment = tenant.rent_payments.length > 0 ? tenant.rent_payments[0] : null;

    let totalPending = 0;
    let paymentStatus: 'PAID' | 'PARTIAL' | 'PENDING' | 'OVERDUE' = 'PAID';
    let nextDueDate: string | undefined;
    const pendingMonths: Array<{
      month: string;
      year: number;
      expected_amount: number;
      paid_amount: number;
      balance: number;
      due_date: string;
      is_overdue: boolean;
    }> = [];

    // Case 1: No payments at all
    if (!lastPayment) {
      // For "no payments" case, show expected due for the current month/cycle using allocations if possible
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const dueFromAllocations = computeProratedDueFromAllocations(start, end);
      totalPending = dueFromAllocations > 0 ? dueFromAllocations : monthlyRent;
      paymentStatus = 'PENDING';
      
      // Due date is end of current month
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      endOfMonth.setHours(23, 59, 59, 999);
      nextDueDate = endOfMonth.toISOString();

      pendingMonths.push({
        month: today.toLocaleString('default', { month: 'long' }),
        year: today.getFullYear(),
        expected_amount: totalPending,
        paid_amount: 0,
        balance: totalPending,
        due_date: endOfMonth.toISOString(),
        is_overdue: false,
      });
    } 
    // Case 2: Has payments - check if coverage has ended
    else {
      const lastPaymentEndDate = lastPayment.tenant_rent_cycles?.cycle_end
        ? new Date(lastPayment.tenant_rent_cycles.cycle_end)
        : null;
      
      if (lastPaymentEndDate) {
        lastPaymentEndDate.setHours(23, 59, 59, 999);
        
        // Case 2a: Last payment end date has passed
        if (lastPaymentEndDate < today) {
          // Payment period has ended - show as PENDING (not OVERDUE)
          // Next cycle expected due (allocation-aware)
          const nextDay = new Date(lastPaymentEndDate);
          nextDay.setDate(nextDay.getDate() + 1);

          // Use the same period granularity as payments: we assume the next cycle is a full calendar month
          // unless the tenant is on midmonth (this service doesn't currently model MIDMONTH cycles).
          const start = new Date(nextDay.getFullYear(), nextDay.getMonth(), 1);
          const end = new Date(nextDay.getFullYear(), nextDay.getMonth() + 1, 0);
          const dueFromAllocations = computeProratedDueFromAllocations(start, end);
          totalPending = dueFromAllocations > 0 ? dueFromAllocations : monthlyRent;
          paymentStatus = 'PENDING';
          
          nextDueDate = nextDay.toISOString();

          const endedMonth = lastPaymentEndDate.toLocaleString('default', { month: 'long' });
          const endedYear = lastPaymentEndDate.getFullYear();

          pendingMonths.push({
            month: endedMonth,
            year: endedYear,
            expected_amount: totalPending,
            paid_amount: 0,
            balance: totalPending,
            due_date: nextDay.toISOString(),
            is_overdue: false,
          });
        }
        // Case 2b: Last payment is still valid (end date is today or future)
        else {
          // Check if partial payment
          const periodStart = lastPayment.tenant_rent_cycles?.cycle_start
            ? new Date(lastPayment.tenant_rent_cycles.cycle_start)
            : new Date(today.getFullYear(), today.getMonth(), 1);
          const periodEnd = lastPayment.tenant_rent_cycles?.cycle_end
            ? new Date(lastPayment.tenant_rent_cycles.cycle_end)
            : new Date(today.getFullYear(), today.getMonth() + 1, 0);

          // Prefer allocation-aware expected due for the period. This allows detecting
          // price differences after a mid-cycle transfer, even if actual_rent_amount
          // was recorded before the transfer.
          const dueFromAllocations = computeProratedDueFromAllocations(periodStart, periodEnd);

          const actualRentAmount = dueFromAllocations > 0
            ? dueFromAllocations
            : lastPayment.actual_rent_amount
              ? parseFloat(lastPayment.actual_rent_amount.toString())
              : monthlyRent;
          const amountPaid = parseFloat(lastPayment.amount_paid.toString());
          
          if (amountPaid < actualRentAmount) {
            // Partial payment
            totalPending = actualRentAmount - amountPaid;
            paymentStatus = 'PARTIAL';
            nextDueDate = lastPaymentEndDate.toISOString();

            const paymentMonth = lastPaymentEndDate.toLocaleString('default', { month: 'long' });
            const paymentYear = lastPaymentEndDate.getFullYear();

            pendingMonths.push({
              month: paymentMonth,
              year: paymentYear,
              expected_amount: actualRentAmount,
              paid_amount: amountPaid,
              balance: actualRentAmount - amountPaid,
              due_date: lastPaymentEndDate.toISOString(),
              is_overdue: false,
            });
          } else {
            // Fully paid and still valid
            totalPending = 0;
            paymentStatus = 'PAID';
            nextDueDate = lastPaymentEndDate.toISOString();
          }
        }
      } else {
        // No end date on last payment - treat as pending
        totalPending = monthlyRent;
        paymentStatus = 'PENDING';
        
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);
        nextDueDate = endOfMonth.toISOString();

        pendingMonths.push({
          month: today.toLocaleString('default', { month: 'long' }),
          year: today.getFullYear(),
          expected_amount: monthlyRent,
          paid_amount: 0,
          balance: monthlyRent,
          due_date: endOfMonth.toISOString(),
          is_overdue: false,
        });
      }
    }

    return {
      tenant_id: tenant.s_no,
      tenant_name: tenant.name,
      room_no: tenant.rooms?.room_no,
      total_pending: Math.round(totalPending * 100) / 100,
      current_month_pending: Math.round(totalPending * 100) / 100,
      overdue_months: 0, // No overdue tracking based on dates
      payment_status: paymentStatus,
      last_payment_date: lastPayment ? new Date(lastPayment.payment_date).toISOString() : undefined,
      next_due_date: nextDueDate,
      monthly_rent: monthlyRent,
      pending_months: pendingMonths.map((m) => ({
        ...m,
        expected_amount: Math.round(m.expected_amount * 100) / 100,
        paid_amount: Math.round(m.paid_amount * 100) / 100,
        balance: Math.round(m.balance * 100) / 100,
      })),
    };
  }

  /**
   * Get all tenants with pending payments
   * Uses the same logic as tenant findAll method with TenantStatusService
   */
  async getAllPendingPayments(pgId?: number): Promise<PendingPaymentDetails[]> {
    const where: Record<string, unknown> = {
      is_deleted: false,
      status: 'ACTIVE',
    };

    if (pgId) {
      where.pg_id = pgId;
    }

    // Get tenants with all payment data (same as tenant findAll method)
    const tenants: Array<TenantForPendingPaymentsList> = await this.prisma.tenants.findMany({
      where,
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
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
            tenant_rent_cycles: {
              select: {
                cycle_start: true,
                cycle_end: true,
              },
            },
          },
        },
        advance_payments: {
          where: {
            is_deleted: false,
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

    // Use the same filtering logic as tenant findAll method
    const tenantsWithPendingRent = this.tenantStatusService.getTenantsWithPendingRent(
      tenants,
    ) as Array<TenantForPendingPaymentsList>;

    // Convert filtered tenants to PendingPaymentDetails format
    const pendingPayments = await Promise.all(
      tenantsWithPendingRent.map((tenant) =>
        this.calculateTenantPendingPayment(tenant.s_no),
      ),
    );

    return pendingPayments;
  }

  /**
   * Check if tenant has payment due tomorrow (end date is today)
   */
  async getTenantsWithPaymentDueTomorrow(
    pgId?: number,
  ): Promise<
    Array<{
      tenant_id: number;
      tenant_name: string;
      room_no?: string;
      last_payment_end_date: string;
      monthly_rent: number;
    }>
  > {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const where: Record<string, unknown> = {
      is_deleted: false,
      status: 'ACTIVE',
    };

    if (pgId) {
      where.pg_id = pgId;
    }

    const tenants = await this.prisma.tenants.findMany({
      where,
      include: {
        rooms: {
          select: {
            room_no: true,
          },
        },
        beds: {
          select: {
            bed_price: true,
          },
        },
        rent_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            payment_date: 'desc',
          },
          take: 1,
          select: {
            tenant_rent_cycles: {
              select: {
                cycle_end: true,
              },
            },
          },
        },
      },
    });

    const dueTomorrow = tenants
      .filter((tenant) => {
        if (tenant.rent_payments.length === 0) return false;

        const lastPayment = tenant.rent_payments[0];
        if (!lastPayment.tenant_rent_cycles?.cycle_end) return false;

        const endDate = new Date(lastPayment.tenant_rent_cycles.cycle_end);
        endDate.setHours(0, 0, 0, 0);

        // Check if end date is today
        return endDate.getTime() === today.getTime();
      })
      .map((tenant) => ({
        tenant_id: tenant.s_no,
        tenant_name: tenant.name,
        room_no: tenant.rooms?.room_no,
        last_payment_end_date: tenant.rent_payments[0].tenant_rent_cycles.cycle_end.toISOString(),
        monthly_rent: tenant.beds?.bed_price
          ? parseFloat(tenant.beds.bed_price.toString())
          : 0,
      }));

    return dueTomorrow;
  }
}
