import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ResponseUtil } from '../../../common/utils/response.util';
import { CheckoutTenantDto } from './dto/checkout-tenant.dto';
import { UpdateCheckoutDateDto } from '../dto/update-checkout-date.dto';
import { TenantRentSummaryService } from '../tenant-rent-summary.service';

@Injectable()
export class CheckoutService {
  constructor(
    private prisma: PrismaService,
    private tenantRentSummaryService: TenantRentSummaryService,
  ) {}

  private toDateOnlyUtc(d: Date): Date {
    return new Date(d.toISOString().split('T')[0] + 'T00:00:00.000Z');
  }

  private makeUtcDateClamped(year: number, month: number, day: number): Date {
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)).getUTCDate();
    const clampedDay = Math.min(Math.max(day, 1), lastDay);
    return new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth(), clampedDay));
  }

  private computeCycleWindow(params: {
    cycleType: 'CALENDAR' | 'MIDMONTH';
    tenantCheckInDate: Date;
    referenceDate: Date;
  }): { cycleStart: Date; cycleEnd: Date; anchorDay: number } {
    const ref = this.toDateOnlyUtc(params.referenceDate);
    const checkIn = this.toDateOnlyUtc(params.tenantCheckInDate);
    const anchorDay = checkIn.getUTCDate();

    const refY = ref.getUTCFullYear();
    const refM = ref.getUTCMonth();
    const refD = ref.getUTCDate();

    if (params.cycleType === 'CALENDAR') {
      const isCheckInMonth =
        ref.getUTCFullYear() === checkIn.getUTCFullYear() && ref.getUTCMonth() === checkIn.getUTCMonth();
      const cycleStart = isCheckInMonth ? checkIn : new Date(Date.UTC(refY, refM, 1));
      const cycleEnd = new Date(Date.UTC(refY, refM + 1, 0));
      return { cycleStart, cycleEnd, anchorDay };
    }

    const startMonth = refD >= anchorDay ? refM : refM - 1;
    const cycleStart = this.makeUtcDateClamped(refY, startMonth, anchorDay);
    const nextStart = this.makeUtcDateClamped(
      cycleStart.getUTCFullYear(),
      cycleStart.getUTCMonth() + 1,
      anchorDay,
    );
    const cycleEnd = new Date(nextStart);
    cycleEnd.setUTCDate(cycleEnd.getUTCDate() - 1);

    return { cycleStart, cycleEnd, anchorDay };
  }

  /**
   * Check out tenant
   */
  async checkout(id: number, checkoutDto: CheckoutTenantDto) {
    // Checkout date is required - must be provided from frontend
    if (!checkoutDto.check_out_date) {
      throw new BadRequestException('Checkout date is required. Please provide a valid checkout date.');
    }

    const checkoutDate = new Date(checkoutDto.check_out_date);

    if (Number.isNaN(checkoutDate.getTime())) {
      throw new BadRequestException('Checkout date is invalid. Please provide a valid checkout date.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenants.findFirst({
        where: {
          s_no: id,
          is_deleted: false,
        },
        include: {
          pg_locations: {
            select: {
              rent_cycle_type: true,
            },
          },
          tenant_allocations: {
            orderBy: { effective_from: 'asc' },
            select: {
              s_no: true,
              effective_from: true,
              effective_to: true,
              bed_price_snapshot: true,
            },
          },
          tenant_rent_cycles: {
            orderBy: { cycle_start: 'asc' },
            select: {
              s_no: true,
              cycle_start: true,
              cycle_end: true,
            },
          },
          rent_payments: {
            where: {
              is_deleted: false,
            },
            select: {
              s_no: true,
              status: true,
              amount_paid: true,
              payment_date: true,
              actual_rent_amount: true,
              cycle_id: true,
            },
          },
          advance_payments: {
            where: {
              is_deleted: false,
            },
            select: {
              s_no: true,
              status: true,
              amount_paid: true,
              payment_date: true,
            },
          },
        },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant with ID ${id} not found`);
      }

      const checkInDate = new Date(tenant.check_in_date);
      if (checkoutDate < checkInDate) {
        throw new BadRequestException(
          `Checkout date must be the same as or after check-in date. Check-in date: ${checkInDate.toISOString().split('T')[0]}, Checkout date: ${checkoutDate.toISOString().split('T')[0]}`
        );
      }

      await tx.tenants.update({
        where: { s_no: id },
        data: {
          check_out_date: checkoutDate,
          status: 'INACTIVE',
        },
      });

      const activeAllocation = (tenant as any).tenant_allocations?.find((a: any) => !a.effective_to);
      if (activeAllocation) {
        await (tx as any).tenant_allocations.update({
          where: { s_no: activeAllocation.s_no },
          data: {
            effective_to: checkoutDate,
            updated_at: new Date(),
          },
        });
      }

      const cycleType = ((tenant as any)?.pg_locations?.rent_cycle_type || 'CALENDAR') as 'CALENDAR' | 'MIDMONTH';
      const checkInUtc = this.toDateOnlyUtc(new Date(tenant.check_in_date));
      const checkoutUtc = this.toDateOnlyUtc(new Date(checkoutDate));

      let cursor = new Date(checkInUtc);
      let iterations = 0;
      const maxIterations = 240;

      while (iterations < maxIterations) {
        iterations++;

        const computed = this.computeCycleWindow({
          cycleType,
          tenantCheckInDate: new Date(tenant.check_in_date),
          referenceDate: cursor,
        });

        const endClamped = computed.cycleEnd > checkoutUtc ? checkoutUtc : computed.cycleEnd;

        await (tx as any).tenant_rent_cycles.upsert({
          where: {
            tenant_id_cycle_start: {
              tenant_id: id,
              cycle_start: computed.cycleStart,
            },
          },
          create: {
            tenant_id: id,
            cycle_type: cycleType,
            anchor_day: computed.anchorDay,
            cycle_start: computed.cycleStart,
            cycle_end: endClamped,
          },
          update: {
            cycle_type: cycleType,
            anchor_day: computed.anchorDay,
            cycle_end: endClamped,
            updated_at: new Date(),
          },
          select: { s_no: true },
        });

        if (endClamped.getTime() >= checkoutUtc.getTime()) break;

        const next = new Date(endClamped);
        next.setUTCDate(next.getUTCDate() + 1);
        cursor = next;
      }

      const tenantAfter = await tx.tenants.findFirst({
        where: {
          s_no: id,
          is_deleted: false,
        },
        include: {
          pg_locations: true,
          rooms: true,
          beds: true,
          tenant_allocations: {
            orderBy: { effective_from: 'asc' },
            select: {
              effective_from: true,
              effective_to: true,
              bed_price_snapshot: true,
            },
          },
          tenant_rent_cycles: {
            orderBy: { cycle_start: 'asc' },
            select: {
              s_no: true,
              cycle_start: true,
              cycle_end: true,
            },
          },
          rent_payments: {
            where: {
              is_deleted: false,
            },
            select: {
              s_no: true,
              status: true,
              amount_paid: true,
              payment_date: true,
              actual_rent_amount: true,
              cycle_id: true,
            },
          },
          advance_payments: {
            where: {
              is_deleted: false,
            },
            select: {
              s_no: true,
              status: true,
              amount_paid: true,
              payment_date: true,
            },
          },
        },
      });

      if (!tenantAfter) {
        throw new NotFoundException(`Tenant with ID ${id} not found`);
      }

      const rentSummary = this.tenantRentSummaryService.buildRentSummary({ tenant: tenantAfter });
      const rentDueAmount = Number(rentSummary?.rent_due_amount || 0);

      const advances = (tenantAfter as any).advance_payments || [];
      const hasAnyAdvance = advances.length > 0;
      const hasPaidAdvance = advances.some((p: any) => p.status === 'PAID');
      const hasNonPaidAdvance = advances.some((p: any) => p.status && p.status !== 'PAID');
      const hasAdvancePending = !hasPaidAdvance || hasNonPaidAdvance || !hasAnyAdvance;

      if (rentDueAmount > 0 || hasAdvancePending) {
        const parts: string[] = [];
        if (rentDueAmount > 0) parts.push(`Pending rent ₹${rentDueAmount}`);
        if (hasAdvancePending) parts.push('Advance pending');
        throw new BadRequestException(
          `Cannot checkout tenant. ${parts.join(' and ')} must be settled before checkout.`
        );
      }

      const updatedTenant = await tx.tenants.findFirst({
        where: { s_no: id },
        include: {
          pg_locations: true,
          rooms: true,
          beds: true,
        },
      });

      return updatedTenant;
    });

    return ResponseUtil.success(result, 'Tenant checked out successfully');
  }

  /**
   * Update or clear checkout date
   */
  async updateCheckoutDate(id: number, updateCheckoutDateDto: UpdateCheckoutDateDto) {
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        tenant_allocations: {
          orderBy: { effective_from: 'asc' },
          select: {
            effective_from: true,
            effective_to: true,
            bed_price_snapshot: true,
          },
        },
        tenant_rent_cycles: {
          orderBy: { cycle_start: 'asc' },
          select: {
            s_no: true,
            cycle_start: true,
            cycle_end: true,
          },
        },
        rent_payments: {
          where: { is_deleted: false },
          select: {
            status: true,
            amount_paid: true,
            actual_rent_amount: true,
            cycle_id: true,
          },
        },
        advance_payments: {
          where: { is_deleted: false },
          select: {
            status: true,
            amount_paid: true,
            payment_date: true,
          },
        },
      },
    });

    let updateData: any = {};

    if (updateCheckoutDateDto.clear_checkout) {
      // Clear checkout date and reactivate tenant (no validation needed for clearing)
      updateData = {
        check_out_date: null,
        status: 'ACTIVE',
      };
    } else if (updateCheckoutDateDto.check_out_date) {
      const rentSummary = this.tenantRentSummaryService.buildRentSummary({ tenant });
      const rentDueAmount = Number(rentSummary?.rent_due_amount || 0);

      const advances = (tenant as any).advance_payments || [];
      const hasAnyAdvance = advances.length > 0;
      const hasPaidAdvance = advances.some((p: any) => p.status === 'PAID');
      const hasNonPaidAdvance = advances.some((p: any) => p.status && p.status !== 'PAID');
      const hasAdvancePending = !hasPaidAdvance || hasNonPaidAdvance || !hasAnyAdvance;

      if (rentDueAmount > 0 || hasAdvancePending) {
        const parts: string[] = [];
        if (rentDueAmount > 0) parts.push(`Rent due ₹${rentDueAmount}`);
        if (hasAdvancePending) parts.push('Advance pending');
        throw new BadRequestException(
          `Cannot update checkout date. Pending dues exist: ${parts.join(' and ')}. Please clear pending amounts before checkout.`
        );
      }

      const checkoutDate = new Date(updateCheckoutDateDto.check_out_date);
      const checkInDate = new Date(tenant.check_in_date);

      // Validate that checkout date is not before check-in date (same-day checkout allowed)
      if (checkoutDate < checkInDate) {
        throw new BadRequestException(
          `Checkout date must be the same as or after check-in date. Check-in date: ${checkInDate.toISOString().split('T')[0]}, Checkout date: ${checkoutDate.toISOString().split('T')[0]}`
        );
      }

      updateData = {
        check_out_date: checkoutDate,
      };
    } else {
      throw new BadRequestException('Either provide check_out_date or set clear_checkout to true');
    }

    const updatedTenant = await this.prisma.tenants.update({
      where: { s_no: id },
      data: updateData,
      include: {
        pg_locations: true,
        rooms: true,
        beds: true,
      },
    });

    const message = updateCheckoutDateDto.clear_checkout
      ? 'Checkout cleared and tenant reactivated successfully'
      : 'Checkout date updated successfully';

    return ResponseUtil.success(updatedTenant, message);
  }
}
