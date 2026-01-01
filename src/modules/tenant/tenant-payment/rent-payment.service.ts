import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {  UpdateTenantPaymentDto } from './dto';
import { ResponseUtil } from '../../../common/utils/response.util';
import { CreateTenantPaymentDto } from './dto/create-rent-payment.dto';

@Injectable()
export class TenantPaymentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createTenantPaymentDto: CreateTenantPaymentDto) {
    // Verify tenant exists
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: createTenantPaymentDto.tenant_id },
      include: {
        pg_locations: {
          select: { rent_cycle_type: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${createTenantPaymentDto.tenant_id} not found`);
    }

    // Check if tenant is checked out (has a check_out_date)
    if (tenant.check_out_date) {
      throw new BadRequestException(
        `Cannot add rent payment for checked-out tenant. Tenant was checked out on ${new Date(tenant.check_out_date).toISOString().split('T')[0]}`
      );
    }


    // Verify room exists
    const room = await this.prisma.rooms.findUnique({
      where: { s_no: createTenantPaymentDto.room_id },
    });

    if (!room) {
      throw new NotFoundException(`Room with ID ${createTenantPaymentDto.room_id} not found`);
    }

    // Verify bed exists
    const bed = await this.prisma.beds.findUnique({
      where: { s_no: createTenantPaymentDto.bed_id },
    });

    if (!bed) {
      throw new NotFoundException(`Bed with ID ${createTenantPaymentDto.bed_id} not found`);
    }

    // Validate amount paid does not exceed actual rent amount
    if (createTenantPaymentDto.amount_paid > createTenantPaymentDto.actual_rent_amount) {
      throw new BadRequestException(
        `Amount paid (₹${createTenantPaymentDto.amount_paid}) cannot exceed actual rent amount (₹${createTenantPaymentDto.actual_rent_amount})`
      );
    }

    // Validate rent period dates (backend is source of truth)
    const dateOnly = (d: Date): string => d.toISOString().split('T')[0];

    const startDate = new Date(createTenantPaymentDto.start_date);
    const endDate = new Date(createTenantPaymentDto.end_date);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException(
        `Invalid rent period dates. Please select valid Start Date and End Date. Received start_date=${createTenantPaymentDto.start_date}, end_date=${createTenantPaymentDto.end_date}.`
      );
    }

    // Inclusive period allowed
    if (startDate > endDate) {
      throw new BadRequestException(
        `Invalid rent period: End Date must be on or after Start Date. Received ${dateOnly(startDate)} to ${dateOnly(endDate)}.`
      );
    }

    const cycleType = (tenant.pg_locations?.rent_cycle_type || 'CALENDAR') as 'CALENDAR' | 'MIDMONTH';

    if (cycleType === 'CALENDAR') {
      const startDay = startDate.getDate();
      const startMonth = startDate.getMonth();
      const startYear = startDate.getFullYear();

      const endDay = endDate.getDate();
      const endMonth = endDate.getMonth();
      const endYear = endDate.getFullYear();

      const lastDayOfMonth = new Date(startYear, startMonth + 1, 0).getDate();
      const isSameMonth = startMonth === endMonth && startYear === endYear;
      const isFullCalendarMonth = startDay === 1 && isSameMonth && endDay === lastDayOfMonth;

      const checkInDateOnly = dateOnly(new Date(tenant.check_in_date));
      const isCheckInMonth =
        new Date(tenant.check_in_date).getFullYear() === startYear &&
        new Date(tenant.check_in_date).getMonth() === startMonth;
      const isCheckInPartialMonth =
        isCheckInMonth &&
        dateOnly(startDate) === checkInDateOnly &&
        isSameMonth &&
        endDay === lastDayOfMonth;

      if (!isFullCalendarMonth && !isCheckInPartialMonth) {
        const monthLast = new Date(startYear, startMonth + 1, 0);
        const expectedFullStart = new Date(startYear, startMonth, 1);

        const checkIn = new Date(tenant.check_in_date);
        const isCheckInMonthForTenant = checkIn.getFullYear() === startYear && checkIn.getMonth() === startMonth;

        const expectedRanges = isCheckInMonthForTenant
          ? `Either ${dateOnly(expectedFullStart)} to ${dateOnly(monthLast)} (full month), or ${dateOnly(checkIn)} to ${dateOnly(monthLast)} (check-in month).`
          : `Expected ${dateOnly(expectedFullStart)} to ${dateOnly(monthLast)}.`;

        throw new BadRequestException(
          `Invalid rent period for CALENDAR cycle. Received ${dateOnly(startDate)} to ${dateOnly(endDate)}. ${expectedRanges}`
        );
      }
    } else {
      // MIDMONTH: start day to same day next month - 1
      const sY = startDate.getFullYear();
      const sM = startDate.getMonth();
      const sD = startDate.getDate();

      const expectedEnd = new Date(sY, sM + 1, sD);
      expectedEnd.setDate(expectedEnd.getDate() - 1);

      const diffDays = Math.abs(
        Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) -
          Date.UTC(expectedEnd.getFullYear(), expectedEnd.getMonth(), expectedEnd.getDate())
      ) / (1000 * 60 * 60 * 24);

      if (diffDays > 1) {
        throw new BadRequestException(
          `Invalid rent period for MIDMONTH cycle. Received ${dateOnly(startDate)} to ${dateOnly(endDate)}. Expected End Date near ${dateOnly(expectedEnd)} (same day next month - 1).`
        );
      }
    }

    // Create the payment
    const payment = await this.prisma.tenant_payments.create({
      data: {
        tenant_id: createTenantPaymentDto.tenant_id,
        pg_id: createTenantPaymentDto.pg_id,
        room_id: createTenantPaymentDto.room_id,
        bed_id: createTenantPaymentDto.bed_id,
        amount_paid: createTenantPaymentDto.amount_paid,
        actual_rent_amount: createTenantPaymentDto.actual_rent_amount,
        payment_date: createTenantPaymentDto.payment_date ? new Date(createTenantPaymentDto.payment_date) : new Date(),
        payment_method: createTenantPaymentDto.payment_method,
        status: createTenantPaymentDto.status,
        start_date: new Date(createTenantPaymentDto.start_date),
        end_date: new Date(createTenantPaymentDto.end_date),
        current_bill: createTenantPaymentDto.current_bill,
        current_bill_id: createTenantPaymentDto.current_bill_id,
        remarks: createTenantPaymentDto.remarks,
      },
      include: {
        tenants: {
          select: {
            s_no: true,
            tenant_id: true,
            name: true,
            phone_no: true,
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
          },
        },
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
      },
    });

    return ResponseUtil.success(payment, 'Tenant payment created successfully');
  }

  async findAll(
    pg_id?: number,
    tenant_id?: number,
    status?: string,
    month?: string,
    year?: number,
    start_date?: string,
    end_date?: string,
    room_id?: number,
    bed_id?: number,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;
    
    const where: any = {
      is_deleted: false,
    };

    if (pg_id) {
      where.pg_id = pg_id;
    }

    if (tenant_id) {
      where.tenant_id = tenant_id;
    }

    if (status) {
      where.status = status;
    }

    if (room_id) {
      where.room_id = room_id;
    }

    if (bed_id) {
      where.bed_id = bed_id;
    }

    // Filter by month and year
    if (month && year) {
      const monthIndex = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
      ].indexOf(month);

      if (monthIndex !== -1) {
        const startOfMonth = new Date(year, monthIndex, 1);
        const endOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59);

        where.payment_date = {
          gte: startOfMonth,
          lte: endOfMonth,
        };
      }
    }

    // Filter by date range (overrides month/year if both provided)
    if (start_date || end_date) {
      where.payment_date = {};
      
      if (start_date) {
        where.payment_date.gte = new Date(start_date);
      }
      
      if (end_date) {
        const endDateTime = new Date(end_date);
        endDateTime.setHours(23, 59, 59, 999);
        where.payment_date.lte = endDateTime;
      }
    }

    const [payments, total] = await Promise.all([
      this.prisma.tenant_payments.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          payment_date: 'desc',
        },
        include: {
          tenants: {
            select: {
              s_no: true,
              tenant_id: true,
              name: true,
              phone_no: true,
              is_deleted: true,
              status: true,
              check_out_date: true,
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
            },
          },
          pg_locations: {
            select: {
              s_no: true,
              location_name: true,
            },
          },
        },
      }),
      this.prisma.tenant_payments.count({ where }),
    ]);

    // Add tenant unavailability reason
    const enrichedData = payments.map(payment => {
      let tenant_unavailable_reason = null;
      
      if (!payment.tenants) {
        tenant_unavailable_reason = 'NOT_FOUND';
      } else if (payment.tenants.is_deleted) {
        tenant_unavailable_reason = 'DELETED';
      } else if (payment.tenants.check_out_date) {
        tenant_unavailable_reason = 'CHECKED_OUT';
      } else if (payment.tenants.status === 'INACTIVE') {
        tenant_unavailable_reason = 'INACTIVE';
      }

      return {
        ...payment,
        tenant_unavailable_reason,
      };
    });

    return ResponseUtil.paginated(enrichedData, total, page, limit, 'Tenant payments fetched successfully');
  }

  async findOne(id: number) {
    const payment = await this.prisma.tenant_payments.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        tenants: {
          select: {
            s_no: true,
            tenant_id: true,
            name: true,
            phone_no: true,
            whatsapp_number: true,
            email: true,
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
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
          },
        },
        current_bills: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Tenant payment with ID ${id} not found`);
    }

    return ResponseUtil.success(payment, 'Tenant payment fetched successfully');
  }

  async update(id: number, updateTenantPaymentDto: UpdateTenantPaymentDto) {
    // Check if payment exists
    const existingPayment = await this.prisma.tenant_payments.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingPayment) {
      throw new NotFoundException(`Tenant payment with ID ${id} not found`);
    }


    const updateData: any = {};

    if (updateTenantPaymentDto.amount_paid !== undefined) {
      updateData.amount_paid = updateTenantPaymentDto.amount_paid;
    }
    if (updateTenantPaymentDto.actual_rent_amount !== undefined) {
      updateData.actual_rent_amount = updateTenantPaymentDto.actual_rent_amount;
    }
    if (updateTenantPaymentDto.payment_date) {
      updateData.payment_date = new Date(updateTenantPaymentDto.payment_date);
    }
    if (updateTenantPaymentDto.payment_method) {
      updateData.payment_method = updateTenantPaymentDto.payment_method;
    }
    if (updateTenantPaymentDto.status) {
      updateData.status = updateTenantPaymentDto.status;
    }
    // Note: start_date and end_date cannot be modified after creation
    if (updateTenantPaymentDto.current_bill !== undefined) {
      updateData.current_bill = updateTenantPaymentDto.current_bill;
    }
    if (updateTenantPaymentDto.current_bill_id !== undefined) {
      updateData.current_bill_id = updateTenantPaymentDto.current_bill_id;
    }
    if (updateTenantPaymentDto.remarks !== undefined) {
      updateData.remarks = updateTenantPaymentDto.remarks;
    }

    updateData.updated_at = new Date();

    const payment = await this.prisma.tenant_payments.update({
      where: { s_no: id },
      data: updateData,
      include: {
        tenants: {
          select: {
            s_no: true,
            tenant_id: true,
            name: true,
            phone_no: true,
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
          },
        },
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
      },
    });

    return ResponseUtil.success(payment, 'Tenant payment updated successfully');
  }

  async remove(id: number) {
    const existingPayment = await this.prisma.tenant_payments.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingPayment) {
      throw new NotFoundException(`Tenant payment with ID ${id} not found`);
    }

    await this.prisma.tenant_payments.update({
      where: { s_no: id },
      data: {
        is_deleted: true,
        updated_at: new Date(),
      },
    });

    return ResponseUtil.noContent('Tenant payment deleted successfully');
  }

  async getPaymentsByTenant(tenant_id: number) {
    const payments = await this.prisma.tenant_payments.findMany({
      where: {
        tenant_id,
        is_deleted: false,
      },
      orderBy: {
        payment_date: 'desc',
      },
      include: {
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
          },
        },
      },
    });

    return ResponseUtil.success(payments, 'Tenant payments fetched successfully');
  }

  async updateStatus(id: number, status: string, payment_date?: string) {
    // Check if payment exists
    const existingPayment = await this.prisma.tenant_payments.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingPayment) {
      throw new NotFoundException(`Tenant payment with ID ${id} not found`);
    }

    // Validate status
    const validStatuses = ['PENDING', 'PAID', 'OVERDUE', 'CANCELLED'];
    if (!validStatuses.includes(status.toUpperCase())) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Update payment status
    const updateData: any = {
      status: status.toUpperCase(),
      updated_at: new Date(),
    };

    // If marking as paid, update payment_date if provided
    if (status.toUpperCase() === 'PAID' && payment_date) {
      updateData.payment_date = new Date(payment_date);
    } else if (status.toUpperCase() === 'PAID' && !payment_date) {
      // Default to current date if marking as paid without a date
      updateData.payment_date = new Date();
    }

    const payment = await this.prisma.tenant_payments.update({
      where: { s_no: id },
      data: updateData,
      include: {
        tenants: {
          select: {
            s_no: true,
            tenant_id: true,
            name: true,
            phone_no: true,
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
          },
        },
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
          },
        },
      },
    });

    return ResponseUtil.success(payment, `Payment status updated to ${status.toUpperCase()} successfully`);
  }

  async detectPaymentGaps(tenant_id: number) {
    // Fetch tenant with check-in date and rent cycle type
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenant_id },
      include: {
        pg_locations: {
          select: { rent_cycle_type: true },
        },
        beds: {
          select: { bed_price: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);
    }

    // Fetch all non-deleted payments sorted by start_date
    const payments = await this.prisma.tenant_payments.findMany({
      where: {
        tenant_id,
        is_deleted: false,
      },
      orderBy: {
        start_date: 'asc',
      },
      select: {
        s_no: true,
        start_date: true,
        end_date: true,
        amount_paid: true,
        actual_rent_amount: true,
        status: true,
      },
    });

    // Allocation history (used to compute prorated due when no explicit rent due exists for a period)
    // Note: requires prisma client regenerate after adding tenant_allocations model
    const allocations = await (this.prisma as any).tenant_allocations.findMany({
      where: {
        tenant_id,
      },
      orderBy: {
        effective_from: 'asc',
      },
      select: {
        effective_from: true,
        effective_to: true,
        bed_price_snapshot: true,
      },
    });

    const formatDateOnly = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const getInclusiveDays = (start: Date, end: Date): number => {
      const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
      return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
    };

    const toDateOnlyUtc = (d: Date): Date => new Date(d.toISOString().split('T')[0] + 'T00:00:00.000Z');

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
      if (!allocations || allocations.length === 0) return 0;

      const start = toDateOnlyUtc(periodStart);
      const end = toDateOnlyUtc(periodEnd);

      // Find allocations overlapping the period
      const overlaps = allocations
        .map((a: any) => ({
          from: toDateOnlyUtc(new Date(a.effective_from)),
          to: a.effective_to ? toDateOnlyUtc(new Date(a.effective_to)) : null,
          price: a.bed_price_snapshot ? Number(a.bed_price_snapshot) : 0,
        }))
        .filter((a: any) => {
          const aTo = a.to ?? end;
          return a.from <= end && aTo >= start;
        })
        .sort((a: any, b: any) => a.from.getTime() - b.from.getTime());

      if (overlaps.length === 0) return 0;

      // Compute due by splitting by allocation and by month boundaries
      let total = 0;
      overlaps.forEach((a: any) => {
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

          // move to next day after this month-part
          const next = new Date(partEnd);
          next.setUTCDate(next.getUTCDate() + 1);
          cursor = next;
        }
      });

      return moneyRound2(total);
    };

    const gaps = [];
    let gapIndex = 0;
    const cycleType = tenant.pg_locations?.rent_cycle_type || 'CALENDAR';

    const bedPriceNumber = tenant.beds?.bed_price ? Number(tenant.beds.bed_price) : 0;
    const moneyRound2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
    const amountsEqualOrGreater = (paid: number, due: number): boolean => paid + 0.00001 >= due;

    const sumPaidForPeriod = (
      cycleStart: Date,
      cycleEnd: Date,
      isCheckInGap: boolean,
    ): number => {
      const cycleStartStr = formatDateOnly(cycleStart);
      const cycleEndStr = formatDateOnly(cycleEnd);

      return payments
        .filter((p) => {
          const pStartStr = new Date(p.start_date).toISOString().split('T')[0];
          const pEndStr = new Date(p.end_date).toISOString().split('T')[0];

          const isPaying = p.status === 'PAID' || p.status === 'PARTIAL';
          if (!isPaying) return false;

          // Primary rule: installments should use the exact same period
          if (pStartStr === cycleStartStr && pEndStr === cycleEndStr) return true;

          // Backward-compat: For CALENDAR check-in partial month, allow legacy full-month payments
          // e.g. payment period is 1st->last day, but gap period is check_in_date->last day
          if (cycleType === 'CALENDAR' && isCheckInGap) {
            const pStart = new Date(p.start_date);
            const pEnd = new Date(p.end_date);
            return pStart <= cycleStart && pEnd >= cycleEnd;
          }

          return false;
        })
        .reduce((sum, p) => sum + (p.amount_paid ? Number(p.amount_paid) : 0), 0);
    };

    const getDueForExactPeriod = (cycleStart: Date, cycleEnd: Date, isCheckInGap: boolean): number => {
      const cycleStartStr = formatDateOnly(cycleStart);
      const cycleEndStr = formatDateOnly(cycleEnd);

      // Prefer user-entered rent due if any payments exist for this exact period
      const dueFromPayments = payments
        .filter((p) => {
          const pStart = new Date(p.start_date).toISOString().split('T')[0];
          const pEnd = new Date(p.end_date).toISOString().split('T')[0];
          return pStart === cycleStartStr && pEnd === cycleEndStr;
        })
        .reduce((max, p) => {
          const val = p.actual_rent_amount ? Number(p.actual_rent_amount) : 0;
          return val > max ? val : max;
        }, 0);

      if (dueFromPayments > 0) {
        return moneyRound2(dueFromPayments);
      }

      // Allocation-based fallback (supports transfers + split-cycle proration)
      const dueFromAllocations = computeProratedDueFromAllocations(cycleStart, cycleEnd);
      if (dueFromAllocations > 0) {
        return dueFromAllocations;
      }

      // Legacy fallback to current bed price (with proration for CALENDAR check-in period)
      if (bedPriceNumber <= 0) return 0;

      if (cycleType === 'CALENDAR' && isCheckInGap) {
        const totalDaysInMonth = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth() + 1, 0).getDate();
        const daysInPeriod = getInclusiveDays(cycleStart, cycleEnd);
        const prorated = (bedPriceNumber / totalDaysInMonth) * daysInPeriod;
        return moneyRound2(prorated);
      }

      return moneyRound2(bedPriceNumber);
    };

    // ============================================================================
    // FOR MIDMONTH: CHECK FOR UNPAID MONTHS BETWEEN CHECK-IN AND NOW
    // ============================================================================
    
    if (cycleType === 'MIDMONTH') {
      const now = new Date();
      
      // Parse check-in date to avoid timezone issues
      const checkInDateStr = tenant.check_in_date.toISOString().split('T')[0];
      let currentCycleStart = new Date(checkInDateStr + 'T00:00:00.000Z');
      const checkInDate = new Date(checkInDateStr + 'T00:00:00.000Z');
      let isFirstCycle = true;
      
      // Find the latest payment end date to determine how far to check
      let latestPaymentEnd = now;
      if (payments.length > 0) {
        const lastPayment = payments[payments.length - 1];
        const lastPaymentEnd = new Date(lastPayment.end_date);
        if (lastPaymentEnd > latestPaymentEnd) {
          latestPaymentEnd = lastPaymentEnd;
        }
      }
      
      let maxIterations = 100; // Safety limit
      let iterations = 0;
      
      while (iterations < maxIterations) {
        iterations++;
        // Get MIDMONTH cycle period (day X to day (X-1) of next month)
        const year = currentCycleStart.getFullYear();
        const month = currentCycleStart.getMonth();
        const day = currentCycleStart.getDate();
        
        const cycleStart = new Date(year, month, day);
        const cycleEnd = new Date(year, month + 1, day);
        cycleEnd.setDate(cycleEnd.getDate() - 1);
        
        // Stop if cycle start date is after the latest payment end date
        if (cycleStart > latestPaymentEnd) {
          break;
        }
        
        // Strict gap close: cycle is paid only if totalPaid(for exact cycleStart/cycleEnd) >= rentDue
        const gapStartStr = cycleStart.getFullYear() + '-' +
          String(cycleStart.getMonth() + 1).padStart(2, '0') + '-' +
          String(cycleStart.getDate()).padStart(2, '0');
        const gapEndStr = cycleEnd.getFullYear() + '-' +
          String(cycleEnd.getMonth() + 1).padStart(2, '0') + '-' +
          String(cycleEnd.getDate()).padStart(2, '0');

        const rentDue = getDueForExactPeriod(cycleStart, cycleEnd, isFirstCycle);
        const totalPaid = moneyRound2(sumPaidForPeriod(cycleStart, cycleEnd, isFirstCycle));

        const isCovered = rentDue > 0 ? amountsEqualOrGreater(totalPaid, rentDue) : totalPaid > 0;

        if (!isCovered) {
          // Format dates to avoid timezone issues
          const daysMissing = getInclusiveDays(cycleStart, cycleEnd);
          const remainingDue = moneyRound2(Math.max(0, rentDue - totalPaid));
          
          gaps.push({
            gapId: `gap_midmonth_${gapIndex}`,
            gapStart: gapStartStr,
            gapEnd: gapEndStr,
            daysMissing: daysMissing,
            afterPaymentId: null,
            beforePaymentId: null,
            priority: isFirstCycle ? -1 : gapIndex, // First cycle gap has highest priority
            isCheckInGap: isFirstCycle, // Mark if it's the first cycle from check-in
            rentDue,
            totalPaid,
            remainingDue,
          });
          gapIndex++;
        }
        
        // Move to next cycle
        currentCycleStart = new Date(cycleEnd);
        currentCycleStart.setDate(currentCycleStart.getDate() + 1);
        isFirstCycle = false;
      }
    } else {
      // ============================================================================
      // FOR CALENDAR: CHECK EACH MONTH SEQUENTIALLY FROM CHECK-IN DATE TO NOW
      // ============================================================================
      
      const now = new Date();
      let currentMonthStart = new Date(tenant.check_in_date);
      currentMonthStart.setDate(1); // Month cursor (used only to iterate months)
      
      while (currentMonthStart <= now) {
        const year = currentMonthStart.getFullYear();
        const month = currentMonthStart.getMonth();
        
        // Get calendar month dates (check-in month supports partial start)
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        
        // Determine if this is check-in gap (check-in month)
        const checkIn = new Date(tenant.check_in_date);
        const isCheckInMonth =
          currentMonthStart.getFullYear() === checkIn.getFullYear() &&
          currentMonthStart.getMonth() === checkIn.getMonth();

        // For CALENDAR check-in month, gap starts at check-in date (partial month support)
        const effectiveStart = isCheckInMonth ? new Date(checkIn) : monthStart;

        const gapStartStr = formatDateOnly(effectiveStart);
        const gapEndStr = formatDateOnly(monthEnd);

        const rentDue = getDueForExactPeriod(effectiveStart, monthEnd, isCheckInMonth);
        const totalPaid = moneyRound2(sumPaidForPeriod(effectiveStart, monthEnd, isCheckInMonth));
        const isCovered = rentDue > 0 ? amountsEqualOrGreater(totalPaid, rentDue) : totalPaid > 0;

        // If not fully covered, emit gap
        if (!isCovered) {
          const gapEndStr = formatDateOnly(monthEnd);
          const daysMissing = getInclusiveDays(effectiveStart, monthEnd);
          const remainingDue = moneyRound2(Math.max(0, rentDue - totalPaid));
          
          gaps.push({
            gapId: `gap_calendar_${gapIndex}`,
            gapStart: gapStartStr,
            gapEnd: gapEndStr,
            daysMissing: daysMissing,
            afterPaymentId: null,
            beforePaymentId: null,
            priority: isCheckInMonth ? -1 : gapIndex, // Check-in month gap has highest priority
            isCheckInGap: isCheckInMonth, // Mark if it's the first month from check-in
            rentDue,
            totalPaid,
            remainingDue,
          });
          gapIndex++;
        }
        
        // Move to next month
        currentMonthStart.setMonth(currentMonthStart.getMonth() + 1);
      }
    }

    gaps.sort((a, b) => {
      const ap = typeof a.priority === 'number' ? a.priority : 0;
      const bp = typeof b.priority === 'number' ? b.priority : 0;
      if (ap !== bp) return ap - bp;

      const as = String(a.gapStart || '');
      const bs = String(b.gapStart || '');
      return as.localeCompare(bs);
    });

    return ResponseUtil.success(
      {
        hasGaps: gaps.length > 0,
        gapCount: gaps.length,
        gaps: gaps,
      },
      gaps.length > 0 ? `Found ${gaps.length} gap(s) in rent periods` : 'No gaps found'
    );
  }

  // ============================================================================
  // CALENDAR CYCLE - NEXT PAYMENT DATES
  // ============================================================================

  private calculateNextPaymentDatesCalendar(lastPaymentEndDate: Date): { startDate: string; endDate: string } {
    // For CALENDAR cycle: next payment starts on 1st of next month
    const lastEnd = new Date(lastPaymentEndDate);
    const nextMonthStart = new Date(lastEnd.getFullYear(), lastEnd.getMonth() + 1, 1);

    const startDate = nextMonthStart.toISOString().split('T')[0];

    // End date is last day of that month
    const endOfMonth = new Date(nextMonthStart.getFullYear(), nextMonthStart.getMonth() + 1, 0);
    const endDate = endOfMonth.toISOString().split('T')[0];

    return { startDate, endDate };
  }

  // ============================================================================
  // MIDMONTH CYCLE - NEXT PAYMENT DATES
  // ============================================================================

  private calculateNextPaymentDatesMidmonth(lastPaymentEndDate: Date): { startDate: string; endDate: string } {
    // For MIDMONTH cycle: next payment starts the day after last payment ends
    const nextStart = new Date(lastPaymentEndDate);
    nextStart.setDate(nextStart.getDate() + 1);

    const startDate = nextStart.toISOString().split('T')[0];

    // End date is same day next month - 1
    const endDate = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, nextStart.getDate());
    endDate.setDate(endDate.getDate() - 1);

    return { startDate, endDate: endDate.toISOString().split('T')[0] };
  }

  // ============================================================================
  // UNIFIED NEXT PAYMENT DATES CALCULATOR
  // ============================================================================

  private calculateNextPaymentDates(lastPaymentEndDate: Date, rentCycleType: string): { startDate: string; endDate: string } {
    if (rentCycleType === 'CALENDAR') {
      return this.calculateNextPaymentDatesCalendar(lastPaymentEndDate);
    } else {
      return this.calculateNextPaymentDatesMidmonth(lastPaymentEndDate);
    }
  }

  async getNextPaymentDates(tenant_id: number, rentCycleType: string, skipGaps: boolean = false) {
    // Get last payment (most recent by end_date)
    const lastPayment = await this.prisma.tenant_payments.findFirst({
      where: {
        tenant_id,
        is_deleted: false,
      },
      orderBy: {
        end_date: 'desc',
      },
      select: {
        end_date: true,
      },
    });

    if (!lastPayment) {
      // No payments exist, get tenant joining date
      const tenant = await this.prisma.tenants.findUnique({
        where: { s_no: tenant_id },
        select: { check_in_date: true },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);
      }

      return ResponseUtil.success(
        {
          suggestedStartDate: new Date(tenant.check_in_date).toISOString().split('T')[0],
          isGapFill: false,
          message: 'First payment - use joining date',
        },
        'No previous payments - use joining date'
      );
    }

    // If skipGaps is true, calculate next cycle after last payment (ignoring gaps)
    if (skipGaps) {
      const { startDate, endDate } = this.calculateNextPaymentDates(new Date(lastPayment.end_date), rentCycleType);

      return ResponseUtil.success(
        {
          suggestedStartDate: startDate,
          suggestedEndDate: endDate,
          isGapFill: false,
          message: `Next payment cycle (skipping gaps) - ${rentCycleType} cycle`,
        },
        'Next payment dates calculated'
      );
    }

    // If skipGaps is false, check for gaps first
    const gapResponse = await this.detectPaymentGaps(tenant_id);
    const gapData = gapResponse.data;

    // If gaps exist, suggest filling the earliest gap
    if (gapData.hasGaps && gapData.gaps.length > 0) {
      const earliestGap = gapData.gaps[0];
      return ResponseUtil.success(
        {
          suggestedStartDate: earliestGap.gapStart,
          suggestedEndDate: earliestGap.gapEnd,
          isGapFill: true,
          gapInfo: earliestGap,
          message: `Gap detected from ${earliestGap.gapStart} to ${earliestGap.gapEnd}. Please fill this gap first.`,
        },
        'Gap detected - suggest filling earliest gap'
      );
    }

    // No gaps, calculate next cycle after last payment
    const { startDate, endDate } = this.calculateNextPaymentDates(new Date(lastPayment.end_date), rentCycleType);

    return ResponseUtil.success(
      {
        suggestedStartDate: startDate,
        suggestedEndDate: endDate,
        isGapFill: false,
        message: `Next payment cycle - ${rentCycleType} cycle`,
      },
      'Next payment dates calculated'
    );
  }
}
