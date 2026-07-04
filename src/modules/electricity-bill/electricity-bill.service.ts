import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { CreateElectricityBillDto, AllocationBasis, RecordPaymentDto } from './dto';

@Injectable()
export class ElectricityBillService {
  constructor(private readonly prisma: PrismaService) {}

  private moneyRound2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private toDateOnly(input: string | Date): Date {
    const d = typeof input === 'string' ? new Date(input) : input;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private getDaysBetween(start: Date, end: Date): number {
    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    return Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
  }

  /**
   * Find all tenants who were active in the room during the bill period.
   * Uses tenant_allocations for bed/room assignment dates AND tenants table
   * check_in_date/check_out_date to ensure the tenant was actually present.
   */
  private async findActiveTenants(roomId: number, pgId: number, periodStart: Date, periodEnd: Date) {
    return this.prisma.tenant_allocations.findMany({
      where: {
        room_id: roomId,
        pg_id: pgId,
        effective_from: { lte: periodEnd },
        OR: [{ effective_to: null }, { effective_to: { gte: periodStart } }],
        tenants: {
          is_deleted: false,
          check_in_date: { lte: periodEnd },
          OR: [{ check_out_date: null }, { check_out_date: { gte: periodStart } }],
        },
      },
      distinct: ['tenant_id'],
      select: {
        tenant_id: true,
      },
    });
  }

  /**
   * Calculate rent-cycle days for each tenant within the bill period.
   * Also caps overlap using tenant check_in_date / check_out_date so
   * occupancy_days never exceeds the tenant's actual stay.
   */
  private async calculateRentCycleDays(
    tenantIds: number[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Map<number, number>> {
    const cycles = await this.prisma.tenant_rent_cycles.findMany({
      where: {
        tenant_id: { in: tenantIds },
        cycle_start: { lte: periodEnd },
        cycle_end: { gte: periodStart },
      },
      select: {
        tenant_id: true,
        cycle_start: true,
        cycle_end: true,
      },
    });

    // Fetch tenant check_in/check_out to cap overlap accurately
    const tenants = await this.prisma.tenants.findMany({
      where: { s_no: { in: tenantIds }, is_deleted: false },
      select: { s_no: true, check_in_date: true, check_out_date: true },
    });
    const tenantMap = new Map<number, { checkIn: Date | null; checkOut: Date | null }>();
    for (const t of tenants) {
      tenantMap.set(t.s_no, {
        checkIn: t.check_in_date ? this.toDateOnly(t.check_in_date) : null,
        checkOut: t.check_out_date ? this.toDateOnly(t.check_out_date) : null,
      });
    }

    const daysMap = new Map<number, number>();
    for (const cycle of cycles) {
      const start = this.toDateOnly(cycle.cycle_start);
      const end = this.toDateOnly(cycle.cycle_end);
      let overlapStart = start > periodStart ? start : periodStart;
      let overlapEnd = end < periodEnd ? end : periodEnd;

      // Cap to tenant's actual occupancy dates
      const tenantDates = tenantMap.get(cycle.tenant_id);
      if (tenantDates) {
        if (tenantDates.checkIn && tenantDates.checkIn > overlapStart) {
          overlapStart = tenantDates.checkIn;
        }
        if (tenantDates.checkOut && tenantDates.checkOut < overlapEnd) {
          overlapEnd = tenantDates.checkOut;
        }
      }

      const days = Math.max(0, this.getDaysBetween(overlapStart, overlapEnd));
      const existing = daysMap.get(cycle.tenant_id) || 0;
      daysMap.set(cycle.tenant_id, existing + days);
    }

    return daysMap;
  }

  /**
   * Build the allocation items for a bill based on the selected basis.
   */
  private async buildAllocationItems(
    dto: CreateElectricityBillDto,
    activeTenantIds: number[],
  ): Promise<{ tenant_id: number; share_amount: number; share_percentage: number; billing_days: number | null }[]> {
    const totalAmount = Number(dto.total_amount);
    const periodStart = this.toDateOnly(dto.bill_period_start);
    const periodEnd = this.toDateOnly(dto.bill_period_end);

    if (activeTenantIds.length === 0) {
      throw new BadRequestException('No active tenants found in this room for the selected period');
    }

    if (dto.allocation_basis === AllocationBasis.CUSTOM) {
      if (!dto.custom_allocations || dto.custom_allocations.length === 0) {
        throw new BadRequestException('Custom allocations are required when allocation_basis is CUSTOM');
      }

      // Validate that custom allocation tenant_ids match active tenants
      const customTenantIds = new Set(dto.custom_allocations.map((item) => item.tenant_id));
      const activeTenantSet = new Set(activeTenantIds);
      const unknownIds = [...customTenantIds].filter((id) => !activeTenantSet.has(id));
      if (unknownIds.length > 0) {
        throw new BadRequestException(
          `Custom allocations contain tenant_ids not active in this room: ${unknownIds.join(', ')}`,
        );
      }
      const missingIds = activeTenantIds.filter((id) => !customTenantIds.has(id));
      if (missingIds.length > 0) {
        throw new BadRequestException(
          `Custom allocations missing active tenant_ids: ${missingIds.join(', ')}`,
        );
      }

      const customTotal = dto.custom_allocations.reduce((sum, item) => sum + Number(item.share_amount), 0);
      if (this.moneyRound2(customTotal) !== this.moneyRound2(totalAmount)) {
        throw new BadRequestException(
          `Custom allocations total (₹${customTotal}) must equal bill total (₹${totalAmount})`,
        );
      }

      return dto.custom_allocations.map((item): { tenant_id: number; share_amount: number; share_percentage: number; billing_days: null } => ({
        tenant_id: item.tenant_id,
        share_amount: this.moneyRound2(Number(item.share_amount)),
        share_percentage: this.moneyRound2(Number(item.share_percentage)),
        billing_days: null,
      }));
    }

    if (dto.allocation_basis === AllocationBasis.EQUAL) {
      const share = this.moneyRound2(totalAmount / activeTenantIds.length);
      // Adjust last tenant to handle rounding
      const runningTotal = this.moneyRound2(share * (activeTenantIds.length - 1));
      const lastShare = this.moneyRound2(totalAmount - runningTotal);
      const percentage = this.moneyRound2(100 / activeTenantIds.length);

      return activeTenantIds.map((tenantId, index): { tenant_id: number; share_amount: number; share_percentage: number; billing_days: null } => ({
        tenant_id: tenantId,
        share_amount: index === activeTenantIds.length - 1 ? lastShare : share,
        share_percentage: percentage,
        billing_days: null,
      }));
    }

    // RENT_CYCLE_DAYS
    const daysMap = await this.calculateRentCycleDays(activeTenantIds, periodStart, periodEnd);
    let totalDays = 0;
    for (const tenantId of activeTenantIds) {
      totalDays += daysMap.get(tenantId) || 0;
    }

    if (totalDays === 0) {
      // Fall back to equal split if no rent cycle days found
      return this.buildAllocationItems(
        { ...dto, allocation_basis: AllocationBasis.EQUAL },
        activeTenantIds,
      );
    }

    const items: { tenant_id: number; share_amount: number; share_percentage: number; billing_days: number | null }[] = [];
    let runningTotal = 0;

    for (let i = 0; i < activeTenantIds.length; i++) {
      const tenantId = activeTenantIds[i];
      const days = daysMap.get(tenantId) || 0;
      const isLast = i === activeTenantIds.length - 1;
      let share: number;

      if (isLast) {
        share = this.moneyRound2(totalAmount - runningTotal);
      } else {
        share = this.moneyRound2(totalAmount * (days / totalDays));
        runningTotal = this.moneyRound2(runningTotal + share);
      }

      items.push({
        tenant_id: tenantId,
        share_amount: share,
        share_percentage: this.moneyRound2((days / totalDays) * 100),
        billing_days: days,
      });
    }

    return items;
  }

  /**
   * Get eligible tenants for a bill period with their occupancy details.
   * This helps the UI show which tenants will be included before creating the bill.
   */
  async getEligibleTenantsForPeriod(roomId: number, pgId: number, periodStart: string, periodEnd: string) {
    const start = this.toDateOnly(periodStart);
    const end = this.toDateOnly(periodEnd);

    if (start > end) {
      throw new BadRequestException('bill_period_start cannot be after bill_period_end');
    }

    // Find active tenants
    const activeTenants = await this.findActiveTenants(roomId, pgId, start, end);
    const activeTenantIds = activeTenants.map((t) => t.tenant_id);

    if (activeTenantIds.length === 0) {
      return ResponseUtil.success([], 'No tenants were active in this room during the selected period');
    }

    // Get tenant details
    const tenants = await this.prisma.tenants.findMany({
      where: { s_no: { in: activeTenantIds }, is_deleted: false },
      select: {
        s_no: true,
        tenant_id: true,
        name: true,
        phone_no: true,
        check_in_date: true,
        check_out_date: true,
      },
    });

    // Calculate rent cycle days for each tenant
    const daysMap = await this.calculateRentCycleDays(activeTenantIds, start, end);

    // Build response with occupancy details
    const eligibleTenants = tenants.map((tenant) => {
      const occupancyDays = daysMap.get(tenant.s_no) || 0;
      const wasCheckedOut = tenant.check_out_date && new Date(tenant.check_out_date) < end;
      
      return {
        tenant_id: tenant.s_no,
        tenant_display_id: tenant.tenant_id,
        name: tenant.name,
        phone_no: tenant.phone_no,
        check_in_date: tenant.check_in_date,
        check_out_date: tenant.check_out_date,
        occupancy_days: occupancyDays,
        status: wasCheckedOut ? 'CHECKED_OUT_DURING_PERIOD' : 'ACTIVE',
      };
    });

    return ResponseUtil.success(eligibleTenants, 'Eligible tenants fetched successfully');
  }

  async create(dto: CreateElectricityBillDto) {
    // Verify room exists
    const room = await this.prisma.rooms.findFirst({
      where: { s_no: dto.room_id, pg_id: dto.pg_id, is_deleted: false },
    });
    if (!room) {
      throw new NotFoundException(`Room with ID ${dto.room_id} not found in PG ${dto.pg_id}`);
    }

    const periodStart = this.toDateOnly(dto.bill_period_start);
    const periodEnd = this.toDateOnly(dto.bill_period_end);

    if (periodStart > periodEnd) {
      throw new BadRequestException('bill_period_start cannot be after bill_period_end');
    }

    // Check for duplicate bill for same room and month
    const year = periodStart.getUTCFullYear();
    const month = periodStart.getUTCMonth();
    const monthStart = new Date(Date.UTC(year, month, 1));
    const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

    const existing = await this.prisma.electricity_bills.findFirst({
      where: {
        room_id: dto.room_id,
        pg_id: dto.pg_id,
        OR: [
          { bill_period_start: { gte: monthStart, lte: monthEnd } },
          { bill_period_end: { gte: monthStart, lte: monthEnd } },
        ],
      },
    });
    if (existing) {
      throw new BadRequestException('Electricity bill already exists for this room and month');
    }

    const activeTenants = await this.findActiveTenants(dto.room_id, dto.pg_id, periodStart, periodEnd);
    const activeTenantIds = activeTenants.map((t) => t.tenant_id);

    const allocationItems = await this.buildAllocationItems(dto, activeTenantIds);

    const bill = await this.prisma.$transaction(async (tx) => {
      const created = await tx.electricity_bills.create({
        data: {
          pg_id: dto.pg_id,
          room_id: dto.room_id,
          bill_period_start: periodStart,
          bill_period_end: periodEnd,
          total_amount: dto.total_amount,
          units_consumed: dto.units_consumed ?? null,
          rate_per_unit: dto.rate_per_unit ?? null,
          meter_reading_start: dto.meter_reading_start ?? null,
          meter_reading_end: dto.meter_reading_end ?? null,
          status: 'PENDING',
          due_date: dto.due_date ? this.toDateOnly(dto.due_date) : null,
        },
      });

      await tx.electricity_bill_items.createMany({
        data: allocationItems.map((item) => ({
          electricity_bill_id: created.s_no,
          tenant_id: item.tenant_id,
          share_amount: item.share_amount,
          share_percentage: item.share_percentage,
          paid_amount: 0,
          status: 'PENDING',
          allocation_basis: dto.allocation_basis,
          billing_days: item.billing_days,
        })),
      });

      return tx.electricity_bills.findUnique({
        where: { s_no: created.s_no },
        include: {
          electricity_bill_items: {
            include: {
              tenants: {
                select: {
                  s_no: true,
                  tenant_id: true,
                  name: true,
                  phone_no: true,
                },
              },
            },
          },
          rooms: { select: { s_no: true, room_no: true } },
          pg_locations: { select: { s_no: true, location_name: true } },
        },
      });
    });

    return ResponseUtil.created(bill, 'Electricity bill created successfully');
  }

  async findAll(params: {
    pg_id?: number;
    room_id?: number;
    page?: number;
    limit?: number;
    status?: string;
    year?: number;
    month?: number;
  }) {
    const { pg_id, room_id, page = 1, limit = 20, status, year, month } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.electricity_billsWhereInput = {};
    if (pg_id) where.pg_id = pg_id;
    if (room_id) where.room_id = room_id;
    if (status) where.status = status;
    if (year && month) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
      where.bill_period_end = { gte: start, lte: end };
    } else if (year) {
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      where.bill_period_end = { gte: start, lte: end };
    }

    const [bills, total] = await Promise.all([
      this.prisma.electricity_bills.findMany({
        where,
        skip,
        take: limit,
        orderBy: { bill_period_end: 'desc' },
        include: {
          rooms: { select: { s_no: true, room_no: true } },
          pg_locations: { select: { s_no: true, location_name: true } },
          electricity_bill_items: {
            include: {
              tenants: {
                select: { s_no: true, tenant_id: true, name: true, phone_no: true },
              },
            },
          },
        },
      }),
      this.prisma.electricity_bills.count({ where }),
    ]);

    return ResponseUtil.paginated(bills, total, page, limit, 'Electricity bills fetched successfully');
  }

  async findOne(id: number) {
    const bill = await this.prisma.electricity_bills.findUnique({
      where: { s_no: id },
      include: {
        rooms: { select: { s_no: true, room_no: true } },
        pg_locations: { select: { s_no: true, location_name: true } },
        electricity_bill_items: {
          include: {
            tenants: {
              select: { s_no: true, tenant_id: true, name: true, phone_no: true },
            },
          },
          orderBy: { s_no: 'asc' },
        },
      },
    });

    if (!bill) {
      throw new NotFoundException(`Electricity bill with ID ${id} not found`);
    }

    return ResponseUtil.success(bill, 'Electricity bill fetched successfully');
  }

  async findPendingItemsByTenant(tenantId: number) {
    const items = await this.prisma.electricity_bill_items.findMany({
      where: {
        tenant_id: tenantId,
        status: { not: 'PAID' },
      },
      include: {
        electricity_bills: {
          include: {
            rooms: { select: { s_no: true, room_no: true } },
            pg_locations: { select: { s_no: true, location_name: true } },
          },
        },
        tenants: {
          select: { s_no: true, tenant_id: true, name: true, phone_no: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return ResponseUtil.success(items, 'Pending electricity bill items fetched successfully');
  }

  async recordPayment(dto: RecordPaymentDto) {
    const item = await this.prisma.electricity_bill_items.findUnique({
      where: { s_no: dto.bill_item_id },
      include: { electricity_bills: true },
    });

    if (!item) {
      throw new NotFoundException(`Electricity bill item with ID ${dto.bill_item_id} not found`);
    }

    if (!item.electricity_bills) {
      throw new BadRequestException('Bill item is not linked to a valid bill');
    }

    const remaining = this.moneyRound2(Number(item.share_amount) - Number(item.paid_amount));
    if (dto.amount > remaining) {
      throw new BadRequestException(
        `Payment amount (₹${dto.amount}) exceeds remaining balance (₹${remaining})`,
      );
    }

    const paymentDate = dto.payment_date ? this.toDateOnly(dto.payment_date) : new Date();
    const newPaidAmount = this.moneyRound2(Number(item.paid_amount) + dto.amount);
    const itemStatus = newPaidAmount >= Number(item.share_amount) ? 'PAID' : 'PARTIAL';

    const updatedItem = await this.prisma.$transaction(async (tx) => {
      await tx.electricity_bill_items.update({
        where: { s_no: dto.bill_item_id },
        data: {
          paid_amount: newPaidAmount,
          payment_date: paymentDate,
          payment_method: dto.payment_method,
          status: itemStatus,
        },
      });

      const aggregate = await tx.electricity_bill_items.aggregate({
        where: { electricity_bill_id: item.electricity_bill_id },
        _sum: { paid_amount: true },
      });

      const totalPaid = Number(aggregate._sum.paid_amount || 0);
      const billTotal = Number(item.electricity_bills.total_amount);
      let billStatus = 'PENDING';
      if (totalPaid >= billTotal) billStatus = 'PAID';
      else if (totalPaid > 0) billStatus = 'PARTIAL';

      await tx.electricity_bills.update({
        where: { s_no: item.electricity_bill_id },
        data: { status: billStatus },
      });

      return tx.electricity_bill_items.findUnique({
        where: { s_no: dto.bill_item_id },
        include: {
          electricity_bills: {
            include: {
              rooms: { select: { s_no: true, room_no: true } },
              pg_locations: { select: { s_no: true, location_name: true } },
            },
          },
          tenants: {
            select: { s_no: true, tenant_id: true, name: true, phone_no: true },
          },
        },
      });
    });

    return ResponseUtil.success(updatedItem, 'Payment recorded successfully');
  }

  async remove(id: number) {
    const bill = await this.prisma.electricity_bills.findUnique({
      where: { s_no: id },
    });
    if (!bill) {
      throw new NotFoundException(`Electricity bill with ID ${id} not found`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.electricity_bill_items.deleteMany({
        where: { electricity_bill_id: id },
      });
      await tx.electricity_bills.delete({
        where: { s_no: id },
      });
    });

    return ResponseUtil.success(null, 'Electricity bill deleted successfully');
  }
}
