import {
  Injectable,
  NotFoundException,
  BadRequestException,
  MethodNotAllowedException,
} from '@nestjs/common';
import { RentCalculationUtil } from '../rent-calculation.util';

import { PrismaService } from '../../../prisma/prisma.service';
import { ResponseUtil } from '../../../common/utils/response.util';
import { CreateTenantPaymentDto, UpdateTenantPaymentDto, VoidTenantPaymentDto } from './dto';

type TenantUnavailableReason = 'NOT_FOUND' | 'DELETED' | 'CHECKED_OUT' | 'INACTIVE' | null;

type PaymentTenantInfo = {
  is_deleted?: boolean;
  check_out_date?: Date | string | null;
  status?: string | null;
} | null;

type PaymentWithTenant = Record<string, unknown> & {
  tenants?: PaymentTenantInfo;
};

type TenantRentCyclesDelegate = {
  upsert<T = { s_no: number; cycle_start: Date; cycle_end: Date }>(args: unknown): Promise<T>;
  findFirst<T = { s_no: number; cycle_start: Date; cycle_end: Date }>(
    args: unknown,
  ): Promise<T | null>;
};

type RentPaymentsDelegate = {
  create<T = unknown>(args: unknown): Promise<T>;
  findMany<T = unknown>(args: unknown): Promise<T[]>;
  count(args: unknown): Promise<number>;
  findFirst<T = unknown>(args: unknown): Promise<T | null>;
  update<T = unknown>(args: unknown): Promise<T>;
};

type Gap = {
  gapId: string;
  cycle_id: number;
  gapStart: string;
  gapEnd: string;
  daysMissing: number;
  priority: number;
  rentDue: number;
  totalPaid: number;
  remainingDue: number;
};

@Injectable()
export class TenantPaymentService {
  constructor(private prisma: PrismaService) {}

  private get prismaDelegates(): {
    tenant_rent_cycles: TenantRentCyclesDelegate;
    rent_payments: RentPaymentsDelegate;
  } {
    return this.prisma as unknown as {
      tenant_rent_cycles: TenantRentCyclesDelegate;
      rent_payments: RentPaymentsDelegate;
    };
  }

  private getDaysBetween(start: Date, end: Date): number {
    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24));
  }

  private moneyRound2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private toDateOnlyUtc(d: Date): Date {
    return new Date(d.toISOString().split('T')[0] + 'T00:00:00.000Z');
  }

  private dateOnlyString(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private makeUtcDateClamped(y: number, m: number, d: number): Date {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const day = Math.min(Math.max(1, d), lastDay);
    return new Date(Date.UTC(y, m, day));
  }

  private computeCycleWindow(params: {
    cycleType: 'CALENDAR' | 'MIDMONTH';
    tenantCheckInDate: Date;
    referenceDate: Date;
  }): { cycleStart: Date; cycleEnd: Date; anchorDay: number; logicalNextYear: number; logicalNextMonth: number } {
    const ref = this.toDateOnlyUtc(params.referenceDate);
    const checkIn = this.toDateOnlyUtc(params.tenantCheckInDate);
    const anchorDay = checkIn.getUTCDate();

    const refY = ref.getUTCFullYear();
    const refM = ref.getUTCMonth();
    const refD = ref.getUTCDate();

    if (params.cycleType === 'CALENDAR') {
      const isCheckInMonth =
        ref.getUTCFullYear() === checkIn.getUTCFullYear() &&
        ref.getUTCMonth() === checkIn.getUTCMonth();
      const cycleStart = isCheckInMonth ? checkIn : new Date(Date.UTC(refY, refM, 1));
      const cycleEnd = new Date(Date.UTC(refY, refM + 1, 0));
      return { cycleStart, cycleEnd, anchorDay, logicalNextYear: refY, logicalNextMonth: refM + 1 };
    }

    // MIDMONTH (TENANT anchored): anchor day is tenant check-in day.
    // Current cycle started on anchor day of this month if refD >= anchorDay, else previous month.
    // IMPORTANT: Do NOT clamp cycleStart to the last day of the month.
    // If anchorDay=30 and the month only has 28 days, the cycle for that month
    // logically starts on the 30th of the PREVIOUS month, not the 28th of Feb.
    // We use the unclamped logical anchor day to determine which month the cycle belongs to,
    // then compute cycleEnd as (nextAnchor - 1 day) using clamped next-month anchor.
    // Logical month index BEFORE clamping — critical for correct next-cycle derivation
    const startMonth = refD >= anchorDay ? refM : refM - 1;

    // cycleStart: clamped (e.g. Feb 30 → Feb 28)
    const cycleStart = this.makeUtcDateClamped(refY, startMonth, anchorDay);

    // MUST use startMonth+1 (logical), NOT cycleStart.getUTCMonth()+1 (clamped).
    // When Feb clamps 30→28, cycleStart.month = 1 (Feb), so +1 = Mar ✓ BUT
    // if anchorDay=30 and Feb has 28 days, clamped cycleStart is still Feb,
    // which would give Mar as next — that part is actually OK here.
    // The real danger is when months like Feb (month=1) clamp and the cursor
    // gets stuck: cursor = cycleEnd+1 = Feb28, refD=28 < anchorDay=30,
    // so startMonth = Feb-1 = Jan again → infinite loop.
    // Fix: next anchor uses the ORIGINAL startMonth index, not clamped month.
    const nextStart = this.makeUtcDateClamped(refY, startMonth + 1, anchorDay);

    // cycleEnd = day before next anchor
    const cycleEnd = new Date(nextStart);
    cycleEnd.setUTCDate(cycleEnd.getUTCDate() - 1);

    // logicalNextMonth is startMonth+1 BEFORE any clamping — needed by caller to advance cursor
    return { cycleStart, cycleEnd, anchorDay, logicalNextYear: refY, logicalNextMonth: startMonth + 1 };
  }

  private computeExpectedRentForCalendarCycle(params: {
    monthlyRent: number;
    cycleStart: Date;
    cycleEnd: Date;
    tenantCheckInDate: Date;
  }): number {
    const monthlyRent = Number(params.monthlyRent || 0);
    if (!(monthlyRent > 0)) return 0;

    const cycleStart = this.toDateOnlyUtc(params.cycleStart);
    const cycleEnd = this.toDateOnlyUtc(params.cycleEnd);
    const checkIn = this.toDateOnlyUtc(params.tenantCheckInDate);

    const year = cycleStart.getUTCFullYear();
    const month = cycleStart.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

    // Rule (locked): for CALENDAR cycle, if tenant joins after 1st in joining month,
    // charge prorated rent from check-in date to month end (inclusive). Else full month.
    const isCheckInMonth = year === checkIn.getUTCFullYear() && month === checkIn.getUTCMonth();
    const isProratedJoinMonth = isCheckInMonth && checkIn.getUTCDate() > 1;

    if (!isProratedJoinMonth) {
      return this.moneyRound2(monthlyRent);
    }

    // Inclusive days from check-in date to month end.
    const startUtc = Date.UTC(
      checkIn.getUTCFullYear(),
      checkIn.getUTCMonth(),
      checkIn.getUTCDate(),
    );
    const endUtc = Date.UTC(
      cycleEnd.getUTCFullYear(),
      cycleEnd.getUTCMonth(),
      cycleEnd.getUTCDate(),
    );
    const daysStayed = Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
    const expected = (monthlyRent / daysInMonth) * Math.max(0, daysStayed);

    return this.moneyRound2(expected);
  }

  private async upsertTenantCycle(params: {
    tenantId: number;
    cycleType: 'CALENDAR' | 'MIDMONTH';
    anchorDay: number;
    cycleStart: Date;
    cycleEnd: Date;
  }): Promise<{ s_no: number; cycle_start: Date; cycle_end: Date }> {
    const createdOrUpdated = await this.prismaDelegates.tenant_rent_cycles.upsert({
      where: {
        tenant_id_cycle_start: {
          tenant_id: params.tenantId,
          cycle_start: params.cycleStart,
        },
      },
      create: {
        tenant_id: params.tenantId,
        cycle_type: params.cycleType,
        anchor_day: params.anchorDay,
        cycle_start: params.cycleStart,
        cycle_end: params.cycleEnd,
      },
      update: {
        cycle_type: params.cycleType,
        anchor_day: params.anchorDay,
        cycle_end: params.cycleEnd,
        updated_at: new Date(),
      },
      select: {
        s_no: true,
        cycle_start: true,
        cycle_end: true,
      },
    });

    return createdOrUpdated;
  }

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
        `Cannot add rent payment for checked-out tenant. Tenant was checked out on ${new Date(tenant.check_out_date).toISOString().split('T')[0]}`,
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

    const cycleType = (tenant.pg_locations?.rent_cycle_type || 'CALENDAR') as
      | 'CALENDAR'
      | 'MIDMONTH';

    const paymentDate = createTenantPaymentDto.payment_date
      ? new Date(createTenantPaymentDto.payment_date)
      : new Date();

    if (Number.isNaN(paymentDate.getTime())) {
      throw new BadRequestException(`Invalid payment_date=${createTenantPaymentDto.payment_date}`);
    }

    let cycleId: number | null = null;
    let cycleStart: Date | null = null;
    let cycleEnd: Date | null = null;

    if (createTenantPaymentDto.cycle_id) {
      const existingCycle = await this.prismaDelegates.tenant_rent_cycles.findFirst({
        where: {
          s_no: createTenantPaymentDto.cycle_id,
          tenant_id: createTenantPaymentDto.tenant_id,
        },
        select: { s_no: true, cycle_start: true, cycle_end: true },
      });

      if (!existingCycle) {
        throw new BadRequestException(
          `Invalid cycle_id=${createTenantPaymentDto.cycle_id} for tenant_id=${createTenantPaymentDto.tenant_id}`,
        );
      }

      cycleId = existingCycle.s_no;
      cycleStart = existingCycle.cycle_start;
      cycleEnd = existingCycle.cycle_end;
    } else {
      // Derive cycle window centrally (TENANT anchored MIDMONTH; CALENDAR supports check-in month partial).
      const computed = this.computeCycleWindow({
        cycleType,
        tenantCheckInDate: tenant.check_in_date,
        referenceDate: paymentDate,
      });

      const cycle = await this.upsertTenantCycle({
        tenantId: createTenantPaymentDto.tenant_id,
        cycleType,
        anchorDay: computed.anchorDay,
        cycleStart: computed.cycleStart,
        cycleEnd: computed.cycleEnd,
      });

      cycleId = cycle.s_no;
      cycleStart = cycle.cycle_start;
      cycleEnd = cycle.cycle_end;
    }

    const monthlyRent = Number(bed?.bed_price ?? 0);
    let computedActualRentAmount: number;

    if (
      createTenantPaymentDto.actual_rent_amount &&
      Number(createTenantPaymentDto.actual_rent_amount) > 0
    ) {
      computedActualRentAmount = this.moneyRound2(
        Number(createTenantPaymentDto.actual_rent_amount),
      );
    } else if (cycleType === 'CALENDAR' && cycleStart && cycleEnd) {
      computedActualRentAmount = this.computeExpectedRentForCalendarCycle({
        monthlyRent,
        cycleStart,
        cycleEnd,
        tenantCheckInDate: tenant.check_in_date,
      });
    } else {
      // Fallback: prorate current bed price for the cycle period
      const daysInPeriod = this.getDaysBetween(cycleStart, cycleEnd) + 1;
      const daysInMonth = new Date(
        Date.UTC(cycleStart.getUTCFullYear(), cycleStart.getUTCMonth() + 1, 0),
      ).getUTCDate();
      computedActualRentAmount = this.moneyRound2((monthlyRent / daysInMonth) * daysInPeriod);
    }

    // Validate amount paid does not exceed computed actual rent amount
    if (Number(createTenantPaymentDto.amount_paid) > computedActualRentAmount) {
      throw new BadRequestException(
        `Amount paid (₹${createTenantPaymentDto.amount_paid}) cannot exceed actual rent amount (₹${computedActualRentAmount})`,
      );
    }

    const amountPaid = this.moneyRound2(Number(createTenantPaymentDto.amount_paid || 0));
    const status =
      amountPaid >= computedActualRentAmount ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'PENDING';

    // Create the payment
    const payment = await this.prismaDelegates.rent_payments.create({
      data: {
        tenant_id: createTenantPaymentDto.tenant_id,
        pg_id: createTenantPaymentDto.pg_id,
        room_id: createTenantPaymentDto.room_id,
        bed_id: createTenantPaymentDto.bed_id,
        cycle_id: cycleId,
        amount_paid: createTenantPaymentDto.amount_paid,
        actual_rent_amount: computedActualRentAmount,
        payment_date: paymentDate,
        payment_method: createTenantPaymentDto.payment_method,
        status,
        current_bill: createTenantPaymentDto.current_bill,
        current_bill_id: createTenantPaymentDto.current_bill_id,
        remarks: createTenantPaymentDto.remarks,
      },
      include: {
        tenant_rent_cycles: {
          select: {
            s_no: true,
            cycle_type: true,
            cycle_start: true,
            cycle_end: true,
          },
        },
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

    const where: Record<string, unknown> = {
      is_deleted: false,
    };

    // By default, do not include voided payments in normal listings.
    // If a caller explicitly requests status=VOIDED, it will override this.
    where.status = { not: 'VOIDED' };

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
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
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
      where.payment_date = {} as Record<string, unknown>;

      if (start_date) {
        (where.payment_date as Record<string, unknown>).gte = new Date(start_date);
      }

      if (end_date) {
        const endDateTime = new Date(end_date);
        endDateTime.setHours(23, 59, 59, 999);
        (where.payment_date as Record<string, unknown>).lte = endDateTime;
      }
    }

    const [payments, total] = await Promise.all([
      this.prismaDelegates.rent_payments.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          payment_date: 'desc',
        },
        include: {
          tenant_rent_cycles: {
            select: {
              s_no: true,
              cycle_type: true,
              cycle_start: true,
              cycle_end: true,
            },
          },
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
      this.prismaDelegates.rent_payments.count({ where }),
    ]);

    // Add tenant unavailability reason
    const enrichedData = (payments as PaymentWithTenant[]).map((payment) => {
      let tenant_unavailable_reason: TenantUnavailableReason = null;

      const tenantInfo = payment.tenants;
      if (!tenantInfo) {
        tenant_unavailable_reason = 'NOT_FOUND';
      } else if (tenantInfo.is_deleted) {
        tenant_unavailable_reason = 'DELETED';
      } else if (tenantInfo.check_out_date) {
        tenant_unavailable_reason = 'CHECKED_OUT';
      } else if (tenantInfo.status === 'INACTIVE') {
        tenant_unavailable_reason = 'INACTIVE';
      }

      return {
        ...payment,
        tenant_unavailable_reason,
      };
    });

    return ResponseUtil.paginated(
      enrichedData,
      total,
      page,
      limit,
      'Tenant payments fetched successfully',
    );
  }

  async findOne(id: number) {
    const payment = await this.prismaDelegates.rent_payments.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        tenant_rent_cycles: {
          select: {
            s_no: true,
            cycle_type: true,
            cycle_start: true,
            cycle_end: true,
          },
        },
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
    const existingPayment = await this.prismaDelegates.rent_payments.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingPayment) {
      throw new NotFoundException(`Tenant payment with ID ${id} not found`);
    }

    const updateData: Record<string, unknown> = {};

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

    const payment = await this.prismaDelegates.rent_payments.update({
      where: { s_no: id },
      data: updateData,
      include: {
        tenant_rent_cycles: {
          select: {
            s_no: true,
            cycle_type: true,
            cycle_start: true,
            cycle_end: true,
          },
        },
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
    void id;
    throw new MethodNotAllowedException(
      'Rent payments cannot be deleted. Use voidPayment to cancel with audit trail.',
    );
  }

  async voidPayment(id: number, body: VoidTenantPaymentDto, voidedByUserId: number) {
    if (!body?.voided_reason || !String(body.voided_reason).trim()) {
      throw new BadRequestException('voided_reason is required');
    }

    const existingPayment = await this.prismaDelegates.rent_payments.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      select: {
        s_no: true,
        tenant_id: true,
        status: true,
        voided_at: true,
        payment_date: true,
        tenants: {
          select: {
            status: true,
            check_out_date: true,
            is_deleted: true,
          },
        },
        tenant_rent_cycles: {
          select: {
            cycle_start: true,
            cycle_end: true,
          },
        },
      },
    });

    if (!existingPayment) {
      throw new NotFoundException(`Tenant payment with ID ${id} not found`);
    }

    const tenantInfo = (existingPayment as unknown as PaymentWithTenant).tenants;
    const tenantStatus = String(tenantInfo?.status ?? '').toUpperCase();
    const tenantCheckedOut = !!tenantInfo?.check_out_date || tenantStatus === 'CHECKED_OUT';
    if (tenantCheckedOut) {
      throw new BadRequestException('Cannot void rent payment for a checked-out tenant');
    }

    const existing = existingPayment as Record<string, unknown>;
    const existingStatus = String(existing.status ?? '').toUpperCase();
    const existingVoidedAt = existing.voided_at;
    if (existingStatus === 'VOIDED' || existingVoidedAt) {
      throw new BadRequestException('Payment is already voided');
    }

    const payment = await this.prismaDelegates.rent_payments.update({
      where: { s_no: id },
      data: {
        status: 'VOIDED',
        voided_at: new Date(),
        voided_by: voidedByUserId,
        voided_reason: String(body.voided_reason).trim(),
        updated_at: new Date(),
      },
      include: {
        tenant_rent_cycles: {
          select: {
            s_no: true,
            cycle_type: true,
            cycle_start: true,
            cycle_end: true,
          },
        },
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

    return ResponseUtil.success(payment, 'Tenant payment voided successfully');
  }

  async getPaymentsByTenant(tenant_id: number) {
    const payments = await this.prismaDelegates.rent_payments.findMany({
      where: {
        tenant_id,
        is_deleted: false,
        status: { not: 'VOIDED' },
      },
      orderBy: {
        payment_date: 'desc',
      },
      include: {
        tenant_rent_cycles: {
          select: {
            s_no: true,
            cycle_type: true,
            cycle_start: true,
            cycle_end: true,
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
      },
    });

    return ResponseUtil.success(payments, 'Tenant payments fetched successfully');
  }

  async updateStatus(id: number, status: string, payment_date?: string) {
    // Check if payment exists
    const existingPayment = await this.prismaDelegates.rent_payments.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
        status: { not: 'VOIDED' },
      },
    });

    if (!existingPayment) {
      throw new NotFoundException(`Tenant payment with ID ${id} not found`);
    }

    // Validate status
    const validStatuses = ['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIAL'];
    if (!validStatuses.includes(status.toUpperCase())) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Update payment status
    const updateData: Record<string, unknown> = {
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

    const payment = await this.prismaDelegates.rent_payments.update({
      where: { s_no: id },
      data: updateData,
      include: {
        tenant_rent_cycles: {
          select: {
            s_no: true,
            cycle_type: true,
            cycle_start: true,
            cycle_end: true,
          },
        },
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

    return ResponseUtil.success(
      payment,
      `Payment status updated to ${status.toUpperCase()} successfully`,
    );
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

    // Fetch all non-deleted payments (cycle-driven)
    const payments: Array<{
      s_no: number;
      cycle_id: number | null;
      amount_paid: unknown;
      actual_rent_amount: unknown;
      status: string | null;
      payment_date: Date | null;
    }> = await this.prismaDelegates.rent_payments.findMany({
      where: {
        tenant_id,
        is_deleted: false,
        status: { not: 'VOIDED' },
      },
      select: {
        s_no: true,
        cycle_id: true,
        amount_paid: true,
        actual_rent_amount: true,
        status: true,
        payment_date: true,
      },
    });

    // Allocation history (used to compute prorated due when no explicit rent due exists for a period)
    // Note: requires prisma client regenerate after adding tenant_allocations model
    const allocations = await this.prisma.tenant_allocations.findMany({
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

    const cycleType = (tenant.pg_locations?.rent_cycle_type || 'CALENDAR') as
      | 'CALENDAR'
      | 'MIDMONTH';

    const computeProratedDueFromAllocations = (periodStart: Date, periodEnd: Date): number => {
      if (!allocations || allocations.length === 0) return 0;

      return RentCalculationUtil.computeExpectedDueFromAllocations({
        periodStart,
        periodEnd,
        cycleType,
        allocations,
      });
    };

    const gaps: Gap[] = [];
    let gapIndex = 0;

    const moneyRound2 = RentCalculationUtil.moneyRound2;
    const amountsEqualOrGreater = (paid: number, due: number): boolean => paid + 0.00001 >= due;

    const isVirtualCycle = (cycleId: number) => cycleId < 0;

    const paymentsInDateRange = (start: Date, end: Date) =>
      payments.filter((p) => {
        if (!p.payment_date) return false;
        const pd = this.toDateOnlyUtc(new Date(p.payment_date));
        return pd >= start && pd <= end;
      });

    const sumPaidForCycle = (cycle: { s_no: number; cycle_start: Date; cycle_end: Date }): number => {
      if (isVirtualCycle(cycle.s_no)) {
        return moneyRound2(
          paymentsInDateRange(cycle.cycle_start, cycle.cycle_end)
            .filter((p) => p.status === 'PAID' || p.status === 'PARTIAL')
            .reduce((sum: number, p) => sum + Number(p.amount_paid || 0), 0),
        );
      }
      return moneyRound2(
        payments
          .filter((p) => p.cycle_id === cycle.s_no && (p.status === 'PAID' || p.status === 'PARTIAL'))
          .reduce((sum: number, p) => sum + Number(p.amount_paid || 0), 0),
      );
    };

    const dueFromPaymentsForCycle = (cycle: { s_no: number; cycle_start: Date; cycle_end: Date }): number => {
      if (isVirtualCycle(cycle.s_no)) {
        return moneyRound2(
          paymentsInDateRange(cycle.cycle_start, cycle.cycle_end)
            .reduce((max: number, p) => Math.max(max, Number(p.actual_rent_amount || 0)), 0),
        );
      }
      return moneyRound2(
        payments
          .filter((p) => p.cycle_id === cycle.s_no)
          .reduce((max: number, p) => Math.max(max, Number(p.actual_rent_amount || 0)), 0),
      );
    };

    const addGapIfNeeded = (cycle: { s_no: number; cycle_start: Date; cycle_end: Date }) => {
      const rentDueFromAllocations = computeProratedDueFromAllocations(
        cycle.cycle_start,
        cycle.cycle_end,
      );
      const rentDueFromPayments = dueFromPaymentsForCycle(cycle);
      // Fallback to current bed price if both allocations and payments are missing
      const currentBedPrice = Number(tenant.beds?.bed_price ?? 0);
      const fallbackDue =
        currentBedPrice > 0
          ? RentCalculationUtil.computeProratedAmountForMonth(
              currentBedPrice,
              cycle.cycle_start,
              cycle.cycle_end,
            )
          : 0;
      const rentDue =
        rentDueFromAllocations > 0
          ? rentDueFromAllocations
          : rentDueFromPayments > 0
            ? rentDueFromPayments
            : fallbackDue;
      const totalPaid = sumPaidForCycle(cycle);
      const isCovered = rentDue > 0 ? amountsEqualOrGreater(totalPaid, rentDue) : totalPaid > 0;

      if (!isCovered) {
        const remainingDue = moneyRound2(Math.max(0, rentDue - totalPaid));
        gaps.push({
          gapId: `gap_${cycleType.toLowerCase()}_${gapIndex}`,
          cycle_id: cycle.s_no,
          gapStart: formatDateOnly(cycle.cycle_start),
          gapEnd: formatDateOnly(cycle.cycle_end),
          daysMissing: RentCalculationUtil.getInclusiveDays(
            new Date(cycle.cycle_start),
            new Date(cycle.cycle_end),
          ),
          priority: gapIndex,
          rentDue,
          totalPaid,
          remainingDue,
        });
        gapIndex++;
      }
    };

    // ============================================================================
    // FOR MIDMONTH: CHECK FOR UNPAID MONTHS BETWEEN CHECK-IN AND NOW
    // ============================================================================

    const now = this.toDateOnlyUtc(new Date());
    const checkIn = this.toDateOnlyUtc(new Date(tenant.check_in_date));
    void checkIn;

    // Fetch existing persisted cycles for this tenant (read-only, no writes)
    const existingCycles = await this.prisma.tenant_rent_cycles.findMany({
      where: { tenant_id },
      orderBy: { cycle_start: 'asc' },
      select: { s_no: true, cycle_start: true, cycle_end: true },
    });

    const cycleMap = new Map(
      existingCycles.map((c) => [this.toDateOnlyUtc(c.cycle_start).getTime(), c]),
    );

    // Generate cycles from check-in until today (inclusive)
    // Upsert missing cycles to DB so they get a real s_no
    let cursor = new Date(checkIn);
    let iterations = 0;
    const maxIterations = 200;
    let virtualSno = -1;

    // anchorDay: for MIDMONTH = check-in day; for CALENDAR = 1
    const anchorDay = cycleType === 'MIDMONTH' ? checkIn.getUTCDate() : 1;

    // Collect virtual cycles to batch-create after the loop
    const virtualCycles: { s_no: number; cycle_start: Date; cycle_end: Date }[] = [];

    while (iterations < maxIterations) {
      iterations++;

      const computed = this.computeCycleWindow({
        cycleType,
        tenantCheckInDate: tenant.check_in_date,
        referenceDate: cursor,
      });

      const cycleStartKey = this.toDateOnlyUtc(computed.cycleStart).getTime();
      const persisted = cycleMap.get(cycleStartKey);

      let cycle: { s_no: number; cycle_start: Date; cycle_end: Date };
      if (persisted) {
        cycle = persisted;
      } else {
        // Not in DB yet — queue for upsert
        const vSno = virtualSno--;
        cycle = { s_no: vSno, cycle_start: computed.cycleStart, cycle_end: computed.cycleEnd };
        virtualCycles.push(cycle);
      }

      addGapIfNeeded({
        s_no: cycle.s_no,
        cycle_start: cycle.cycle_start,
        cycle_end: cycle.cycle_end,
      });

      // Stop once we've processed the cycle that contains today
      if (computed.cycleEnd >= now) break;

      // Advance cursor to the next cycle's anchor date.
      // nextStart = makeUtcDateClamped(logicalNextYear, logicalNextMonth, anchorDay)
      // e.g. Jan(startMonth=0)+1 = Feb, anchor=30 → Feb 28 (clamped).
      // But cursor=Feb28, refD(28)<anchorDay(30) → startMonth=Jan again → infinite loop.
      // Solution: if nextStart would clamp to a date < anchorDay, it means the anchor
      // doesn't fit that month. The cursor must land ON or AFTER the anchor in that month,
      // so we add one extra day to guarantee refD >= anchorDay in the following iteration.
      const nextCursor = this.makeUtcDateClamped(computed.logicalNextYear, computed.logicalNextMonth, computed.anchorDay);
      const nextCursorDay = nextCursor.getUTCDate();
      if (nextCursorDay < computed.anchorDay) {
        // The anchor was clamped (e.g. Feb 30 → Feb 28). Adding 1 day (Mar 1) ensures
        // the next computeCycleWindow call sees refD(1) < anchorDay(30) → startMonth=Feb,
        // which is exactly the next cycle (Feb 28 → Mar 29).
        cursor = new Date(nextCursor);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      } else {
        cursor = nextCursor;
      }
    }

    // Create all missing cycles in one batch, skipping any that already exist
    // (avoids unique constraint race condition from parallel upserts)
    if (virtualCycles.length > 0) {
      await this.prisma.tenant_rent_cycles.createMany({
        data: virtualCycles.map((vc) => ({
          tenant_id,
          cycle_type: cycleType,
          anchor_day: anchorDay,
          cycle_start: vc.cycle_start,
          cycle_end: vc.cycle_end,
        })),
        skipDuplicates: true,
      });
    }

    // Always patch gaps with real s_no values from DB.
    // The initial cycleMap may have stale/wrong-dated rows from before the fix,
    // so any gap with a negative cycle_id needs to be resolved against a fresh fetch.
    const hasNegativeIds = gaps.some((g) => g.cycle_id < 0);
    if (hasNegativeIds) {
      const freshCycles = await this.prisma.tenant_rent_cycles.findMany({
        where: { tenant_id },
        select: { s_no: true, cycle_start: true },
      });
      const freshMap = new Map(
        freshCycles.map((c) => [this.toDateOnlyUtc(c.cycle_start).getTime(), c.s_no]),
      );
      for (const gap of gaps) {
        if (gap.cycle_id < 0) {
          const startKey = new Date(gap.gapStart + 'T00:00:00.000Z').getTime();
          const realSno = freshMap.get(startKey);
          if (realSno !== undefined) {
            gap.cycle_id = realSno;
          }
        }
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
      gaps.length > 0 ? `Found ${gaps.length} gap(s) in rent periods` : 'No gaps found',
    );
  }

  async detectPaymentGapsBulk(
    tenantIds: number[],
    options?: { concurrency?: number },
  ): Promise<Record<number, { hasGaps: boolean; gapCount: number; gaps: Gap[] }>> {
    const uniqueIds = Array.from(
      new Set(
        (tenantIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0),
      ),
    );

    const result: Record<number, { hasGaps: boolean; gapCount: number; gaps: Gap[] }> = {};
    if (uniqueIds.length === 0) return result;

    const concurrency =
      typeof options?.concurrency === 'number' &&
      Number.isFinite(options.concurrency) &&
      options.concurrency > 0
        ? Math.floor(options.concurrency)
        : 5;

    let index = 0;
    const worker = async () => {
      while (index < uniqueIds.length) {
        const current = uniqueIds[index];
        index++;

        try {
          const r = await this.detectPaymentGaps(current);
          const data = (r?.data ?? {}) as { hasGaps?: boolean; gapCount?: number; gaps?: Gap[] };
          result[current] = {
            hasGaps: !!data.hasGaps,
            gapCount:
              typeof data.gapCount === 'number'
                ? data.gapCount
                : Array.isArray(data.gaps)
                  ? data.gaps.length
                  : 0,
            gaps: Array.isArray(data.gaps) ? data.gaps : [],
          };
        } catch {
          result[current] = { hasGaps: false, gapCount: 0, gaps: [] };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, uniqueIds.length) }, () => worker()),
    );
    return result;
  }

  // ============================================================================
  // CALENDAR CYCLE - NEXT PAYMENT DATES
  // ============================================================================

  async getNextPaymentDates(tenant_id: number, rentCycleType: string, skipGaps: boolean = false) {
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenant_id },
      include: {
        pg_locations: { select: { rent_cycle_type: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenant_id} not found`);
    }

    const cycleType = (tenant.pg_locations?.rent_cycle_type || rentCycleType || 'CALENDAR') as
      | 'CALENDAR'
      | 'MIDMONTH';

    const gapsResponse = await this.detectPaymentGaps(tenant_id);
    const gapsData = gapsResponse.data as { hasGaps?: boolean; gaps?: Gap[] };

    if (!skipGaps && gapsData?.hasGaps && (gapsData.gaps || []).length > 0) {
      const earliestGap = (gapsData.gaps || [])[0];
      return ResponseUtil.success(
        {
          suggestedCycleId: earliestGap.cycle_id,
          suggestedStartDate: earliestGap.gapStart,
          suggestedEndDate: earliestGap.gapEnd,
          isGapFill: true,
          gapInfo: earliestGap,
          message: `Gap detected from ${earliestGap.gapStart} to ${earliestGap.gapEnd}. Please fill this gap first.`,
        },
        'Gap detected - suggest filling earliest gap',
      );
    }

    // No gaps (or skipGaps=true). Suggest next cycle after the current cycle.
    const today = this.toDateOnlyUtc(new Date());
    const computedCurrent = this.computeCycleWindow({
      cycleType,
      tenantCheckInDate: tenant.check_in_date,
      referenceDate: today,
    });

    const currentCycle = await this.upsertTenantCycle({
      tenantId: tenant_id,
      cycleType,
      anchorDay: computedCurrent.anchorDay,
      cycleStart: computedCurrent.cycleStart,
      cycleEnd: computedCurrent.cycleEnd,
    });

    // Next cycle is based on the day after current cycle end
    const nextRef = new Date(currentCycle.cycle_end);
    nextRef.setUTCDate(nextRef.getUTCDate() + 1);
    const computedNext = this.computeCycleWindow({
      cycleType,
      tenantCheckInDate: tenant.check_in_date,
      referenceDate: nextRef,
    });

    const nextCycle = await this.upsertTenantCycle({
      tenantId: tenant_id,
      cycleType,
      anchorDay: computedNext.anchorDay,
      cycleStart: computedNext.cycleStart,
      cycleEnd: computedNext.cycleEnd,
    });

    return ResponseUtil.success(
      {
        suggestedCycleId: nextCycle.s_no,
        suggestedStartDate: this.dateOnlyString(nextCycle.cycle_start),
        suggestedEndDate: this.dateOnlyString(nextCycle.cycle_end),
        isGapFill: false,
        message: `Next rent cycle (${cycleType})`,
      },
      'Next payment dates calculated',
    );
  }
}
