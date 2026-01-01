import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PendingRentCalculatorService } from '../common/pending-rent-calculator.service';
import { RentCycleCalculatorService } from '../common/rent-cycle-calculator.service';
import { S3DeletionService } from '../common/s3-deletion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TransferTenantDto } from './dto/transfer-tenant.dto';
import { ResponseUtil } from '../../common/utils/response.util';
import { TenantStatusService } from './tenant-status/tenant-status.service';
import { SubscriptionRestrictionService } from '../subscription/subscription-restriction.service';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    private tenantStatusService: TenantStatusService,
    private pendingRentCalculatorService: PendingRentCalculatorService,
    private rentCycleCalculatorService: RentCycleCalculatorService,
    private s3DeletionService: S3DeletionService,
    private subscriptionRestrictionService: SubscriptionRestrictionService,
  ) {}

  private resolveCurrentRentCycleForDate(params: {
    cycleType: 'CALENDAR' | 'MIDMONTH';
    cycleStartDay?: number | null;
    referenceDateOnly: Date;
  }): { cycleStart: Date; cycleEnd: Date } {
    const makeUtcDateClamped = (y: number, m: number, d: number): Date => {
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const day = Math.min(Math.max(1, d), lastDay);
      return new Date(Date.UTC(y, m, day));
    };

    const ref = params.referenceDateOnly;
    const refY = ref.getUTCFullYear();
    const refM = ref.getUTCMonth();
    const refD = ref.getUTCDate();

    if (params.cycleType === 'CALENDAR') {
      const cycleStart = new Date(Date.UTC(refY, refM, 1));
      const cycleEnd = new Date(Date.UTC(refY, refM + 1, 0));
      return { cycleStart, cycleEnd };
    }

    const startDay = params.cycleStartDay && params.cycleStartDay > 0 ? params.cycleStartDay : 1;

    // If reference day is before the cycle start day, the current cycle started in the previous month.
    const startMonth = refD >= startDay ? refM : refM - 1;
    const startYear = refD >= startDay ? refY : refY;

    const cycleStart = makeUtcDateClamped(startYear, startMonth, startDay);

    // End = next cycle start - 1 day
    const nextStart = makeUtcDateClamped(
      cycleStart.getUTCFullYear(),
      cycleStart.getUTCMonth() + 1,
      startDay,
    );
    const cycleEnd = new Date(nextStart);
    cycleEnd.setUTCDate(cycleEnd.getUTCDate() - 1);

    return { cycleStart, cycleEnd };
  }

  async transferTenant(tenantId: number, dto: TransferTenantDto) {
    const effectiveFrom = new Date(dto.effective_from);
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException('Invalid effective_from date. Please provide a valid date.');
    }

    // Normalize to date-only boundary (avoid timezone drift)
    const effectiveFromDateOnly = new Date(effectiveFrom.toISOString().split('T')[0] + 'T00:00:00.000Z');

    const tenant = await this.prisma.tenants.findFirst({
      where: { s_no: tenantId, is_deleted: false },
      include: {
        pg_locations: true,
        rooms: true,
        beds: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    if (tenant.status !== 'ACTIVE') {
      throw new BadRequestException('Only ACTIVE tenants can be transferred.');
    }

    const checkInDateOnly = new Date(tenant.check_in_date.toISOString().split('T')[0] + 'T00:00:00.000Z');
    if (effectiveFromDateOnly < checkInDateOnly) {
      throw new BadRequestException(
        `Invalid effective_from date. It cannot be before tenant check-in date (${tenant.check_in_date.toISOString().split('T')[0]}).`
      );
    }

    // Block multiple transfers in the same rent cycle (based on tenant's current PG rent cycle settings)
    const tenantPg: any = tenant.pg_locations;
    const cycleType: 'CALENDAR' | 'MIDMONTH' = tenantPg?.rent_cycle_type || 'CALENDAR';
    const cycleStartDay: number | null | undefined = tenantPg?.rent_cycle_start ?? null;

    const { cycleStart, cycleEnd } = this.resolveCurrentRentCycleForDate({
      cycleType,
      cycleStartDay,
      referenceDateOnly: effectiveFromDateOnly,
    });

    const existingTransferInCycle = await (this.prisma as any).tenant_allocations.findFirst({
      where: {
        tenant_id: tenantId,
        effective_from: {
          gte: cycleStart,
          lte: cycleEnd,
        },
        // Exclude initial join allocation
        NOT: {
          effective_from: checkInDateOnly,
        },
      },
      select: { s_no: true, effective_from: true },
    });

    if (existingTransferInCycle) {
      throw new BadRequestException('Tenant can be transferred only once per rent cycle.');
    }

    // Validate target PG
    const targetPg = await this.prisma.pg_locations.findFirst({
      where: { s_no: dto.to_pg_id, is_deleted: false },
      select: { s_no: true, organization_id: true },
    });
    if (!targetPg) {
      throw new NotFoundException(`PG Location with ID ${dto.to_pg_id} not found`);
    }

    // Validate target room belongs to target PG
    const targetRoom = await this.prisma.rooms.findFirst({
      where: { s_no: dto.to_room_id, is_deleted: false, pg_id: dto.to_pg_id },
      select: { s_no: true, pg_id: true, room_no: true },
    });
    if (!targetRoom) {
      throw new NotFoundException(`Room with ID ${dto.to_room_id} not found in PG ${dto.to_pg_id}`);
    }

    // Validate target bed belongs to target room + PG
    const targetBed = await this.prisma.beds.findFirst({
      where: { s_no: dto.to_bed_id, is_deleted: false, room_id: dto.to_room_id, pg_id: dto.to_pg_id },
      select: { s_no: true, bed_no: true, bed_price: true, room_id: true, pg_id: true },
    });
    if (!targetBed) {
      throw new NotFoundException(
        `Bed with ID ${dto.to_bed_id} not found in room ${dto.to_room_id} and PG ${dto.to_pg_id}`
      );
    }

    // Check if bed is already occupied by another active tenant
    const occupiedBed = await this.prisma.tenants.findFirst({
      where: {
        bed_id: dto.to_bed_id,
        status: 'ACTIVE',
        is_deleted: false,
        NOT: { s_no: tenantId },
      },
      select: { s_no: true, name: true },
    });
    if (occupiedBed) {
      throw new BadRequestException(`Selected bed is already occupied by another active tenant (${occupiedBed.name}).`);
    }

    const bedPriceSnapshot = targetBed.bed_price ? Number(targetBed.bed_price) : 0;

    // Close previous allocation (if any) and create the new allocation
    const dayBefore = new Date(effectiveFromDateOnly);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

    const updatedTenant = await this.prisma.$transaction(async (tx) => {
      const lastAllocation = await (tx as any).tenant_allocations.findFirst({
        where: {
          tenant_id: tenantId,
          OR: [{ effective_to: null }, { effective_to: { gte: effectiveFromDateOnly } }],
        },
        orderBy: { effective_from: 'desc' },
      });

      if (lastAllocation) {
        if (effectiveFromDateOnly <= lastAllocation.effective_from) {
          throw new BadRequestException(
            `Invalid effective_from date. It must be after the previous allocation start date (${lastAllocation.effective_from.toISOString().split('T')[0]}).`
          );
        }

        await (tx as any).tenant_allocations.update({
          where: { s_no: lastAllocation.s_no },
          data: {
            effective_to: dayBefore,
            updated_at: new Date(),
          },
        });
      }

      await (tx as any).tenant_allocations.create({
        data: {
          tenant_id: tenantId,
          pg_id: dto.to_pg_id,
          room_id: dto.to_room_id,
          bed_id: dto.to_bed_id,
          effective_from: effectiveFromDateOnly,
          effective_to: null,
          bed_price_snapshot: bedPriceSnapshot,
        },
      });

      return await tx.tenants.update({
        where: { s_no: tenantId },
        data: {
          pg_id: dto.to_pg_id,
          room_id: dto.to_room_id,
          bed_id: dto.to_bed_id,
          updated_at: new Date(),
        },
        include: {
          pg_locations: true,
          rooms: true,
          beds: true,
        },
      });
    });

    return ResponseUtil.success(updatedTenant, 'Tenant transferred successfully');
  }

  /**
   * Create a new tenant
   */
  async create(createTenantDto: CreateTenantDto) {
    // Generate unique tenant_id
    const tenantId = await this.generateTenantId();

    // Verify PG location exists
    const pgLocation = await this.prisma.pg_locations.findUnique({
      where: { s_no: createTenantDto.pg_id },
    });

    if (!pgLocation) {
      throw new NotFoundException(`PG Location with ID ${createTenantDto.pg_id} not found`);
    }

    await this.subscriptionRestrictionService.assertCanCreateTenantForOrganization(pgLocation.organization_id);

    // Verify room exists if provided
    if (createTenantDto.room_id) {
      const room = await this.prisma.rooms.findUnique({
        where: { s_no: createTenantDto.room_id },
      });

      if (!room) {
        throw new NotFoundException(`Room with ID ${createTenantDto.room_id} not found`);
      }
    }

    // Verify bed exists if provided
    let bedForAllocation: { s_no: number; room_id: number | null; pg_id: number | null; bed_price: any } | null = null;
    if (createTenantDto.bed_id) {
      const bed = await this.prisma.beds.findUnique({
        where: { s_no: createTenantDto.bed_id },
        select: {
          s_no: true,
          room_id: true,
          pg_id: true,
          bed_price: true,
        },
      });

      if (!bed) {
        throw new NotFoundException(`Bed with ID ${createTenantDto.bed_id} not found`);
      }

      bedForAllocation = bed;

      // Check if bed is already occupied by another active tenant
      const occupiedBed = await this.prisma.tenants.findFirst({
        where: {
          bed_id: createTenantDto.bed_id,
          status: 'ACTIVE',
          is_deleted: false,
        },
      });

      if (occupiedBed) {
        throw new BadRequestException(`Bed with ID ${createTenantDto.bed_id} is already occupied`);
      }
    }

    // Create tenant
    const tenant = await this.prisma.$transaction(async (tx) => {
      const checkInDate = new Date(createTenantDto.check_in_date);
      const checkInDateOnly = new Date(checkInDate.toISOString().split('T')[0] + 'T00:00:00.000Z');

      const resolvedRoomId =
        createTenantDto.room_id ?? (bedForAllocation && bedForAllocation.room_id ? bedForAllocation.room_id : undefined);

      const createdTenant = await tx.tenants.create({
        data: {
          tenant_id: tenantId,
          name: createTenantDto.name,
          phone_no: createTenantDto.phone_no,
          whatsapp_number: createTenantDto.whatsapp_number,
          email: createTenantDto.email,
          pg_id: createTenantDto.pg_id,
          room_id: resolvedRoomId,
          bed_id: createTenantDto.bed_id,
          check_in_date: checkInDate,
          check_out_date: createTenantDto.check_out_date ? new Date(createTenantDto.check_out_date) : null,
          status: (createTenantDto.status as any) || 'ACTIVE',
          occupation: createTenantDto.occupation,
          tenant_address: createTenantDto.tenant_address,
          city_id: createTenantDto.city_id,
          state_id: createTenantDto.state_id,
          images: createTenantDto.images,
          proof_documents: createTenantDto.proof_documents,
        },
        include: {
          pg_locations: {
            select: {
              s_no: true,
              location_name: true,
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
          city: {
            select: {
              s_no: true,
              name: true,
            },
          },
          state: {
            select: {
              s_no: true,
              name: true,
            },
          },
        },
      });

      if (createTenantDto.bed_id && bedForAllocation && createdTenant.pg_id && createdTenant.room_id && createdTenant.bed_id) {
        await (tx as any).tenant_allocations.create({
          data: {
            tenant_id: createdTenant.s_no,
            pg_id: createdTenant.pg_id,
            room_id: createdTenant.room_id,
            bed_id: createdTenant.bed_id,
            effective_from: checkInDateOnly,
            effective_to: null,
            bed_price_snapshot: bedForAllocation.bed_price ? Number(bedForAllocation.bed_price) : 0,
          },
        });
      }

      return createdTenant;
    });

    return ResponseUtil.success(tenant, 'Tenant created successfully');
  }

  /**
   * Get all tenants with filters and rent cycle information
   */
  async findAll(params: {
    page?: number;
    limit?: number;
    pg_id?: number;
    room_id?: number;
    status?: string;
    search?: string;
    pending_rent?: boolean;
    pending_advance?: boolean;
    partial_rent?: boolean;
  }) {
    const { page = 1, limit = 10, pg_id, room_id, status, search, pending_rent, pending_advance, partial_rent } = params;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      is_deleted: false,
    };

    if (pg_id) {
      where.pg_id = pg_id;
    }

    if (room_id) {
      where.room_id = room_id;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { tenant_id: { contains: search, mode: 'insensitive' } },
        { phone_no: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.tenants.count({ where });

    // Get tenants with all related data including rent cycle type
    const tenants: any[] = await (this.prisma as any).tenants.findMany({
      where,
      skip,
      take: limit,
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
        city: {
          select: {
            s_no: true,
            name: true,
          },
        },
        state: {
          select: {
            s_no: true,
            name: true,
          },
        },
        tenant_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            end_date: 'desc',
          },
          select: {
            s_no: true,
            payment_date: true,
            amount_paid: true,
            actual_rent_amount: true,
            start_date: true,
            end_date: true,
            payment_method: true,
            status: true,
            remarks: true,
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
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Enrich tenants with status calculations and rent cycle information
    const enrichedTenants = tenants.map((tenant: any) => {
      const statusEnriched = this.tenantStatusService.enrichTenantsWithStatus([tenant])[0];

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
        const allocations = (tenant as any).tenant_allocations || [];
        if (!allocations || allocations.length === 0) return 0;

        const start = toDateOnlyUtc(periodStart);
        const end = toDateOnlyUtc(periodEnd);

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

            const next = new Date(partEnd);
            next.setUTCDate(next.getUTCDate() + 1);
            cursor = next;
          }
        });

        return moneyRound2(total);
      };

      const paymentsSortedByEndDesc = [...(tenant.tenant_payments || [])].sort(
        (a: any, b: any) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime(),
      );

      const computeCycleSummaries = () => {
        const groups = new Map<string, any[]>();

        paymentsSortedByEndDesc.forEach((p: any) => {
          const startKey = p.start_date ? dateOnly(p.start_date) : '';
          const endKey = p.end_date ? dateOnly(p.end_date) : '';
          const key = `${startKey}__${endKey}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(p);
        });

        const summaries = Array.from(groups.entries())
          .map(([key, ps]) => {
            const [startStr, endStr] = key.split('__');
            const payingRows = ps.filter((p) => p.status === 'PAID' || p.status === 'PARTIAL');
            const totalPaid = moneyRound2(
              payingRows.reduce((sum: number, p: any) => sum + Number(p.amount_paid || 0), 0),
            );
            const dueFromPayments = moneyRound2(
              ps.reduce((max: number, p: any) => Math.max(max, Number(p.actual_rent_amount || 0)), 0),
            );

            // Dynamic expected due for this cycle based on allocation history (bed_price_snapshot)
            const expectedFromAllocations = (() => {
              try {
                const start = new Date(`${startStr}T00:00:00.000Z`);
                const end = new Date(`${endStr}T00:00:00.000Z`);
                return computeExpectedDueFromAllocations(start, end);
              } catch {
                return 0;
              }
            })();

            const due = expectedFromAllocations > 0 ? expectedFromAllocations : dueFromPayments;
            const remainingDue = moneyRound2(Math.max(0, due - totalPaid));

            let status: 'NO_PAYMENT' | 'PAID' | 'PARTIAL' | 'PENDING' | 'FAILED' = 'NO_PAYMENT';
            if (due > 0) {
              if (totalPaid >= due) status = 'PAID';
              else if (totalPaid > 0) status = 'PARTIAL';
              else status = 'NO_PAYMENT';
            } else {
              // If due is unknown (0), fall back to existence of paying rows
              if (totalPaid > 0) status = 'PARTIAL';
            }

            return {
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
          .filter((s) => Boolean(s.start_date) && Boolean(s.end_date))
          .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());

        return summaries;
      };

      const cycleSummaries = computeCycleSummaries();
      const latestCycle = cycleSummaries.length > 0 ? cycleSummaries[0] : null;
      
      // Calculate current rent cycle dates
      let currentRentCycle = null;
      if (tenant.pg_locations && tenant.tenant_payments.length > 0) {
        const lastPayment = tenant.tenant_payments[0];
        const cycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';
        const nextCycleDates = this.rentCycleCalculatorService.getNextRentCycleDates(
          lastPayment.end_date.toISOString().split('T')[0],
          cycleType,
        );
        const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
          nextCycleDates.startDate,
          nextCycleDates.endDate,
        );
        currentRentCycle = {
          start_date: nextCycleDates.startDate,
          end_date: nextCycleDates.endDate,
          days: daysInPeriod,
          cycle_type: cycleType,
        };
      } else if (tenant.pg_locations) {
        // No previous payments, calculate from check-in date
        const cycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';
        const checkInDate = tenant.check_in_date.toISOString().split('T')[0];
        let cycleDates;
        
        if (cycleType === 'CALENDAR') {
          cycleDates = this.rentCycleCalculatorService.getCalendarMonthDates(checkInDate);
        } else {
          cycleDates = this.rentCycleCalculatorService.getMidmonthDates(checkInDate);
        }
        
        const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
          cycleDates.start,
          cycleDates.end,
        );
        currentRentCycle = {
          start_date: cycleDates.start,
          end_date: cycleDates.end,
          days: daysInPeriod,
          cycle_type: cycleType,
        };
      }

      const paymentStatus = latestCycle?.status || 'NO_PAYMENT';

      const underpaidCycles = cycleSummaries.filter(
        (s) => s.status === 'PARTIAL' && s.remainingDue > 0,
      );

      const partialPayments = underpaidCycles.flatMap((s) => s.payments);
      const totalPartialDue = moneyRound2(
        underpaidCycles.reduce((sum: number, s) => sum + Number(s.remainingDue || 0), 0),
      );

      // Check for unpaid months between check-in date and now
      const unpaidMonths = this.getUnpaidMonthsWithCycleDates(
        tenant.check_in_date,
        tenant.check_out_date,
        tenant.tenant_payments,
        tenant.pg_locations?.rent_cycle_type as 'CALENDAR' | 'MIDMONTH'
      );
      
      const bedPriceNumber = tenant.beds?.bed_price ? Number(tenant.beds.bed_price) : 0;

      // Reuse the same allocation-aware computation for unpaid cycles too
      const computeProratedDueFromAllocations = computeExpectedDueFromAllocations;

      // Strict per-cycle amounts
      const partialDueAmount = moneyRound2(totalPartialDue);
      const pendingDueAmount = moneyRound2(
        unpaidMonths.reduce((sum: number, m: any) => {
          const start = new Date(`${m.cycle_start}T00:00:00.000Z`);
          const end = new Date(`${m.cycle_end}T00:00:00.000Z`);

          const dueFromAllocations = computeProratedDueFromAllocations(start, end);
          if (dueFromAllocations > 0) return sum + dueFromAllocations;

          // Legacy fallback: assume current bed price for full cycle (or prorate if partial calendar month)
          const daysInPeriod = getInclusiveDays(start, end);
          const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
          const legacy = bedPriceNumber > 0 ? (bedPriceNumber / daysInMonth) * daysInPeriod : 0;
          return sum + legacy;
        }, 0)
      );
      const rentDueAmount = moneyRound2(partialDueAmount + pendingDueAmount);

      // Strict status flags for the latest cycle, then overridden by unpaid cycles
      const isRentPaidBase = paymentStatus === 'PAID';
      const isRentPartialBase = paymentStatus === 'PARTIAL' && partialDueAmount > 0;

      // If there are unpaid cycles, tenant cannot be fully paid
      const isRentPaid = unpaidMonths.length === 0 && isRentPaidBase;
      const isRentPartial = !isRentPaid && isRentPartialBase;
      
      return {
        ...statusEnriched,
        is_rent_paid: isRentPaid,
        is_rent_partial: isRentPartial,
        rent_due_amount: rentDueAmount,
        partial_due_amount: partialDueAmount,
        pending_due_amount: pendingDueAmount,
        rent_cycle: currentRentCycle,
        payment_status: paymentStatus,
        partial_payments: partialPayments,
        total_partial_due: totalPartialDue,
        unpaid_months: unpaidMonths,
        tenant_payments: tenant.tenant_payments,
        advance_payments: tenant.advance_payments,
        refund_payments: tenant.refund_payments,
        payment_cycle_summaries: cycleSummaries,
      };
    });

    // Filter by pending rent if requested
    let filteredTenants = enrichedTenants;
    
    if (pending_rent) {
      filteredTenants = this.tenantStatusService.getTenantsWithPendingRent(filteredTenants);
    }

    // Filter by pending advance if requested
    if (pending_advance) {
      filteredTenants = this.tenantStatusService.getTenantsWithoutAdvance(filteredTenants);
    }

    // Filter by partial rent if requested
    if (partial_rent) {
      filteredTenants = this.tenantStatusService.getTenantsWithPartialRent(filteredTenants);
    }

    // Recalculate pagination based on filtered results
    const filteredTotal = filteredTenants.length;
    const paginatedFilteredTenants = pending_rent || pending_advance || partial_rent
      ? filteredTenants 
      : filteredTenants;

    return ResponseUtil.paginated(
      paginatedFilteredTenants,
      pending_rent || pending_advance || partial_rent ? filteredTotal : total,
      page,
      limit,
      'Tenants fetched successfully'
    );
  }

  /**
   * Get tenant by ID with complete details
   */
  async findOne(id: number) {
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            address: true,
            city: true,
            state: true,
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
        city: {
          select: {
            s_no: true,
            name: true,
          },
        },
        state: {
          select: {
            s_no: true,
            name: true,
          },
        },
        tenant_payments: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            payment_date: 'desc',
          },
          select: {
            s_no: true,
            payment_date: true,
            pg_id: true,
            room_id: true,
            bed_id: true,
            amount_paid: true,
            actual_rent_amount: true,
            start_date: true,
            end_date: true,
            payment_method: true,
            remarks: true,
            status: true,
            pg_locations: {
              select: {
                s_no: true,
                location_name: true,
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
            pg_id: true,
            room_id: true,
            bed_id: true,
            amount_paid: true,
            actual_rent_amount: true,
            payment_method: true,
            status: true,
            remarks: true,
            pg_locations: {
              select: {
                s_no: true,
                location_name: true,
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
            pg_id: true,
            room_id: true,
            bed_id: true,
            amount_paid: true,
            payment_method: true,
            payment_date: true,
            status: true,
            remarks: true,
            actual_rent_amount: true,
            pg_locations: {
              select: {
                s_no: true,
                location_name: true,
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
        },
        current_bills: {
          where: {
            is_deleted: false,
          },
          orderBy: {
            bill_date: 'desc',
          },
          select: {
            s_no: true,
            bill_amount: true,
            bill_date: true,
            created_at: true,
            updated_at: true,
          },
        },
        tenant_allocations: {
          orderBy: {
            effective_from: 'asc',
          },
          select: {
            s_no: true,
            effective_from: true,
            effective_to: true,
            bed_price_snapshot: true,
            pg_id: true,
            room_id: true,
            bed_id: true,
            pg_locations: {
              select: {
                s_no: true,
                location_name: true,
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
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    // Enrich tenant with status calculations using TenantStatusService
    const enrichedTenant = this.tenantStatusService.enrichTenantsWithStatus([tenant])[0];

    // Dynamic due computation (allocation-aware) so transfers within a paid period reflect the price difference
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

    const computeExpectedDueFromAllocations = (periodStart: Date, periodEnd: Date): number => {
      const allocations = (tenant as any).tenant_allocations || [];
      if (!allocations || allocations.length === 0) return 0;

      const start = toDateOnlyUtc(periodStart);
      const end = toDateOnlyUtc(periodEnd);

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

          const next = new Date(partEnd);
          next.setUTCDate(next.getUTCDate() + 1);
          cursor = next;
        }
      });

      return moneyRound2(total);
    };

    const payments = [...((tenant as any).tenant_payments || [])]
      .filter((p: any) => p.start_date && p.end_date)
      .sort((a: any, b: any) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());

    // Group payments by cycle window (start_date + end_date)
    const cycleGroups = new Map<string, any[]>();
    payments.forEach((p: any) => {
      const startKey = new Date(p.start_date).toISOString().split('T')[0];
      const endKey = new Date(p.end_date).toISOString().split('T')[0];
      const key = `${startKey}__${endKey}`;
      if (!cycleGroups.has(key)) cycleGroups.set(key, []);
      cycleGroups.get(key)!.push(p);
    });

    const cycleSummaries = Array.from(cycleGroups.entries())
      .map(([key, ps]) => {
        const [startStr, endStr] = key.split('__');
        const payingRows = ps.filter((p: any) => p.status === 'PAID' || p.status === 'PARTIAL');
        const totalPaid = moneyRound2(payingRows.reduce((sum: number, p: any) => sum + Number(p.amount_paid || 0), 0));
        const dueFromPayments = moneyRound2(ps.reduce((max: number, p: any) => Math.max(max, Number(p.actual_rent_amount || 0)), 0));
        const expectedFromAllocations = computeExpectedDueFromAllocations(
          new Date(`${startStr}T00:00:00.000Z`),
          new Date(`${endStr}T00:00:00.000Z`),
        );
        const due = expectedFromAllocations > 0 ? expectedFromAllocations : dueFromPayments;
        const remainingDue = moneyRound2(Math.max(0, due - totalPaid));
        const status = due > 0 ? (totalPaid >= due ? 'PAID' : totalPaid > 0 ? 'PARTIAL' : 'NO_PAYMENT') : totalPaid > 0 ? 'PARTIAL' : 'NO_PAYMENT';
        return { start_date: startStr, end_date: endStr, totalPaid, due, remainingDue, status, expected_from_allocations: expectedFromAllocations };
      })
      .sort((a, b) => new Date(b.end_date).getTime() - new Date(a.end_date).getTime());

    const dynamicPartialDue = moneyRound2(
      cycleSummaries
        .filter((s: any) => s.status === 'PARTIAL' && s.remainingDue > 0)
        .reduce((sum: number, s: any) => sum + Number(s.remainingDue || 0), 0),
    );

    const unpaidMonths = this.getUnpaidMonthsWithCycleDates(
      tenant.check_in_date,
      tenant.check_out_date,
      (tenant as any).tenant_payments || [],
      (tenant as any).pg_locations?.rent_cycle_type as 'CALENDAR' | 'MIDMONTH',
    );

    const pendingDueAmount = moneyRound2(
      unpaidMonths.reduce((sum: number, m: any) => {
        const start = new Date(`${m.cycle_start}T00:00:00.000Z`);
        const end = new Date(`${m.cycle_end}T00:00:00.000Z`);
        const dueFromAllocations = computeExpectedDueFromAllocations(start, end);
        if (dueFromAllocations > 0) return sum + dueFromAllocations;

        const bedPriceNumber = (tenant as any).beds?.bed_price ? Number((tenant as any).beds.bed_price) : 0;
        const daysInPeriod = getInclusiveDays(start, end);
        const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
        const legacy = bedPriceNumber > 0 ? (bedPriceNumber / daysInMonth) * daysInPeriod : 0;
        return sum + legacy;
      }, 0),
    );

    const rentDueAmount = moneyRound2(dynamicPartialDue + pendingDueAmount);

    return ResponseUtil.success(
      {
        ...enrichedTenant,
        rent_due_amount: rentDueAmount,
        partial_due_amount: dynamicPartialDue,
        pending_due_amount: pendingDueAmount,
        unpaid_months: unpaidMonths,
        payment_cycle_summaries: cycleSummaries,
      },
      'Tenant fetched successfully',
    );
  }

  /**
   * Update tenant
   */
  async update(id: number, updateTenantDto: UpdateTenantDto) {
    // Check if tenant exists
    const existingTenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!existingTenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    if (updateTenantDto.check_in_date) {
      const d = new Date(updateTenantDto.check_in_date);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid check-in date');
      }
    }

    if (updateTenantDto.check_out_date) {
      const d = new Date(updateTenantDto.check_out_date);
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid check-out date');
      }
    }

    const effectiveCheckInDate = updateTenantDto.check_in_date
      ? new Date(updateTenantDto.check_in_date)
      : existingTenant.check_in_date
        ? new Date(existingTenant.check_in_date)
        : null;

    const effectiveCheckOutDate = updateTenantDto.check_out_date
      ? new Date(updateTenantDto.check_out_date)
      : existingTenant.check_out_date
        ? new Date(existingTenant.check_out_date)
        : null;

    // If tenant has checkout date (existing or updating), do not allow check-in date to be after it
    // Allowed: same day (check_in_date <= check_out_date)
    if (effectiveCheckInDate && effectiveCheckOutDate && effectiveCheckInDate > effectiveCheckOutDate) {
      throw new BadRequestException(
        `Check-in date must be the same as or before check-out date. Check-in date: ${effectiveCheckInDate
          .toISOString()
          .split('T')[0]}, Check-out date: ${effectiveCheckOutDate.toISOString().split('T')[0]}`
      );
    }

    // If changing bed, verify new bed
    if (updateTenantDto.bed_id && updateTenantDto.bed_id !== existingTenant.bed_id) {

      // Check if new bed is available
      const newBed = await this.prisma.beds.findUnique({
        where: { s_no: updateTenantDto.bed_id },
      });

      if (!newBed) {
        throw new NotFoundException(`Bed with ID ${updateTenantDto.bed_id} not found`);
      }

      // Check if new bed is already occupied
      const occupiedBed = await this.prisma.tenants.findFirst({
        where: {
          bed_id: updateTenantDto.bed_id,
          status: 'ACTIVE',
          is_deleted: false,
          s_no: { not: id },
        },
      });

      if (occupiedBed) {
        throw new BadRequestException(`Bed with ID ${updateTenantDto.bed_id} is already occupied`);
      }
    }

    // Handle S3 image deletion if images are being updated
    if (updateTenantDto.images !== undefined) {
      const oldImages = (Array.isArray(existingTenant.images) ? existingTenant.images : []) as string[];
      const newImages = (Array.isArray(updateTenantDto.images) ? updateTenantDto.images : []) as string[];
      
      await this.s3DeletionService.deleteRemovedFiles(
        oldImages,
        newImages,
        'tenant',
        'images',
      );
    }

    // Handle S3 proof document deletion if proof_documents are being updated
    if (updateTenantDto.proof_documents !== undefined) {
      const oldDocuments = (Array.isArray(existingTenant.proof_documents) ? existingTenant.proof_documents : []) as string[];
      const newDocuments = (Array.isArray(updateTenantDto.proof_documents) ? updateTenantDto.proof_documents : []) as string[];
      
      await this.s3DeletionService.deleteRemovedFiles(
        oldDocuments,
        newDocuments,
        'tenant',
        'proof documents',
      );
    }

    // Update tenant
    const tenant = await this.prisma.tenants.update({
      where: { s_no: id },
      data: {
        name: updateTenantDto.name,
        phone_no: updateTenantDto.phone_no,
        whatsapp_number: updateTenantDto.whatsapp_number,
        email: updateTenantDto.email,
        pg_id: updateTenantDto.pg_id,
        room_id: updateTenantDto.room_id,
        bed_id: updateTenantDto.bed_id,
        check_in_date: updateTenantDto.check_in_date ? new Date(updateTenantDto.check_in_date) : undefined,
        check_out_date: updateTenantDto.check_out_date ? new Date(updateTenantDto.check_out_date) : undefined,
        status: updateTenantDto.status as any,
        occupation: updateTenantDto.occupation,
        tenant_address: updateTenantDto.tenant_address,
        city_id: updateTenantDto.city_id,
        state_id: updateTenantDto.state_id,
        images: updateTenantDto.images,
        proof_documents: updateTenantDto.proof_documents,
        updated_at: new Date(),
      },
      include: {
        pg_locations: true,
        rooms: true,
        beds: true,
        city: true,
        state: true,
      },
    });

    return ResponseUtil.success(tenant, 'Tenant updated successfully');

  }

  /**
   * Delete tenant (soft delete)
   */
  async remove(id: number) {
    const tenant = await this.prisma.tenants.findFirst({
      where: {
        s_no: id,
        is_deleted: false,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    // Check if checkout date is in the future or today (not completed)
    if (tenant.check_out_date) {
      const now = new Date();
      const checkoutDate = new Date(tenant.check_out_date);
      
      // Set checkout date to end of day (23:59:59)
      checkoutDate.setHours(23, 59, 59, 999);
      
      if (checkoutDate > now) {
        throw new BadRequestException('Cannot delete tenant. The bed will become available only after the checkout day is completely finished.');
      }
    }

    // Soft delete tenant
    await this.prisma.tenants.update({
      where: { s_no: id },
      data: {
        is_deleted: true,
        status : 'INACTIVE'
      },
    });

    return ResponseUtil.noContent('Tenant deleted successfully');
  }

  /**
   * Generate unique tenant ID
   */
  private async generateTenantId(): Promise<string> {
    const prefix = 'TNT';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  }

  /**
   * Calculate rent cycle dates for a tenant based on PG's rent cycle type
   * Supports both CALENDAR and MIDMONTH cycles
   */
  async calculateTenantRentCycleDates(tenantId: number, referenceDate?: string) {
    // Get tenant with PG location details
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            rent_cycle_type: true,
          },
        },
        tenant_payments: {
          orderBy: { end_date: 'desc' },
          take: 1,
          select: {
            end_date: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    if (!tenant.pg_locations) {
      throw new BadRequestException('Tenant PG location not found');
    }

    const pgRentCycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';
    const dateToUse = referenceDate || tenant.check_in_date.toISOString().split('T')[0];

    let rentCycleDates: { start: string; end: string };

    if (pgRentCycleType === 'CALENDAR') {
      // For CALENDAR: 1st to last day of month
      rentCycleDates = this.rentCycleCalculatorService.getCalendarMonthDates(dateToUse);
    } else {
      // For MIDMONTH: same day to same day next month - 1
      rentCycleDates = this.rentCycleCalculatorService.getMidmonthDates(dateToUse);
    }

    // Validate the calculated dates
    const validation = this.rentCycleCalculatorService.validateRentPeriod(
      rentCycleDates.start,
      rentCycleDates.end,
      pgRentCycleType,
    );

    const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
      rentCycleDates.start,
      rentCycleDates.end,
    );

    return ResponseUtil.success({
      tenant_id: tenant.s_no,
      tenant_name: tenant.name,
      pg_name: tenant.pg_locations.location_name,
      rent_cycle_type: pgRentCycleType,
      cycle_description: this.rentCycleCalculatorService.getCycleTypeDescription(pgRentCycleType),
      current_cycle: {
        start_date: rentCycleDates.start,
        end_date: rentCycleDates.end,
        days: daysInPeriod,
        is_valid: validation.isValid,
        validation_error: validation.error,
      },
      has_previous_payments: tenant.tenant_payments.length > 0,
      last_payment_end_date: tenant.tenant_payments[0]?.end_date?.toISOString().split('T')[0] || null,
    }, 'Rent cycle dates calculated successfully');
  }

  /**
   * Get next rent cycle dates for a tenant
   * Calculates the next rent period based on the last payment end date
   */
  async getNextRentCycleDates(tenantId: number) {
    // Get tenant with PG location and last payment details
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            rent_cycle_type: true,
          },
        },
        tenant_payments: {
          orderBy: { end_date: 'desc' },
          take: 1,
          select: {
            end_date: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    if (!tenant.pg_locations) {
      throw new BadRequestException('Tenant PG location not found');
    }

    if (tenant.tenant_payments.length === 0) {
      throw new BadRequestException('No previous payments found. Use calculateTenantRentCycleDates instead.');
    }

    const pgRentCycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';
    const lastPaymentEndDate = tenant.tenant_payments[0].end_date.toISOString().split('T')[0];

    // Calculate next cycle dates
    const nextCycleDates = this.rentCycleCalculatorService.getNextRentCycleDates(
      lastPaymentEndDate,
      pgRentCycleType,
    );

    // Validate the calculated dates
    const validation = this.rentCycleCalculatorService.validateRentPeriod(
      nextCycleDates.startDate,
      nextCycleDates.endDate,
      pgRentCycleType,
    );

    const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
      nextCycleDates.startDate,
      nextCycleDates.endDate,
    );

    return ResponseUtil.success({
      tenant_id: tenant.s_no,
      tenant_name: tenant.name,
      pg_name: tenant.pg_locations.location_name,
      rent_cycle_type: pgRentCycleType,
      cycle_description: this.rentCycleCalculatorService.getCycleTypeDescription(pgRentCycleType),
      last_payment_end_date: lastPaymentEndDate,
      next_cycle: {
        start_date: nextCycleDates.startDate,
        end_date: nextCycleDates.endDate,
        days: daysInPeriod,
        is_valid: validation.isValid,
        validation_error: validation.error,
      },
    }, 'Next rent cycle dates calculated successfully');
  }

  /**
   * Validate rent period dates for a tenant
   * Ensures dates match the PG's rent cycle pattern
   */
  async validateTenantRentPeriod(
    tenantId: number,
    startDate: string,
    endDate: string,
  ) {
    // Get tenant with PG location details
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
      include: {
        pg_locations: {
          select: {
            s_no: true,
            location_name: true,
            rent_cycle_type: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    if (!tenant.pg_locations) {
      throw new BadRequestException('Tenant PG location not found');
    }

    const pgRentCycleType = tenant.pg_locations.rent_cycle_type as 'CALENDAR' | 'MIDMONTH';

    // Validate the dates
    const validation = this.rentCycleCalculatorService.validateRentPeriod(
      startDate,
      endDate,
      pgRentCycleType,
    );

    const daysInPeriod = this.rentCycleCalculatorService.calculateDaysInPeriod(
      startDate,
      endDate,
    );

    return ResponseUtil.success({
      tenant_id: tenant.s_no,
      tenant_name: tenant.name,
      pg_name: tenant.pg_locations.location_name,
      rent_cycle_type: pgRentCycleType,
      cycle_description: this.rentCycleCalculatorService.getCycleTypeDescription(pgRentCycleType),
      validation_result: {
        start_date: startDate,
        end_date: endDate,
        days: daysInPeriod,
        is_valid: validation.isValid,
        error: validation.error,
      },
    }, 'Rent period validation completed');
  }

  /**
   * Get unpaid months using cycle start/end dates
   * 
   * Logic:
   * 1. Start from check-in date
   * 2. For each cycle until now:
   *    - Calculate cycle period based on cycle type
   *    - Check if PAID or PARTIAL payment exists for that cycle
   *    - If NO payment → Add to unpaid months
   *    - Move to next cycle
   * 3. Return ALL unpaid cycle periods
   * 
   * MIDMONTH Example: Check-in 10 Dec 2025
   * Cycle 1: 10 Dec 2025 - 09 Jan 2026 (day 10 to day 10-1 of next month)
   * Cycle 2: 10 Jan 2026 - 09 Feb 2026
   * Cycle 3: 10 Feb 2026 - 09 Mar 2026
   */
  private getUnpaidMonthsWithCycleDates(
    checkInDate: Date,
    checkOutDate: Date | null,
    tenantPayments: any[],
    cycleType: 'CALENDAR' | 'MIDMONTH'
  ): any[] {
    const formatDateOnly = (d: Date): string => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const endDate = checkOutDate && new Date(checkOutDate) < now ? new Date(checkOutDate) : now;
    endDate.setHours(0, 0, 0, 0);

    const unpaidMonths: any[] = [];

    // Parse check-in date to avoid timezone issues (same as detectPaymentGaps)
    const checkInDateStr = new Date(checkInDate).toISOString().split('T')[0];
    let currentCycleStart = new Date(checkInDateStr + 'T00:00:00.000Z');

    // Sort payments by start_date to process in order
    const sortedPayments = [...tenantPayments].sort(
      (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime(),
    );
    
    // Generate cycles from check-in date onwards
    // Include all unpaid cycles up to the latest payment end date or today, whichever is later
    let maxIterations = 100; // Safety limit to prevent infinite loops
    let iterations = 0;
    
    // Find the latest payment end date to determine how far to check
    let latestPaymentEnd = endDate;
    if (sortedPayments.length > 0) {
      const lastPayment = sortedPayments[sortedPayments.length - 1];
      const lastPaymentEnd = new Date(lastPayment.end_date);
      lastPaymentEnd.setHours(0, 0, 0, 0);
      if (lastPaymentEnd > latestPaymentEnd) {
        latestPaymentEnd = lastPaymentEnd;
      }
    }
    
    let isFirstCycle = true;

    while (iterations < maxIterations) {
      iterations++;
      let cyclePeriod: any;
      
      if (cycleType === 'CALENDAR') {
        // CALENDAR: 1st to last day of month
        cyclePeriod = this.getCalendarCyclePeriod(currentCycleStart);
      } else {
        // MIDMONTH: day X to day (X-1) of next month
        cyclePeriod = this.getMidmonthCyclePeriod(currentCycleStart);
      }
      
      // Stop if cycle start date is after the latest payment end date
      if (cyclePeriod.start > latestPaymentEnd) {
        break;
      }
      
      const cycleStartStr = formatDateOnly(cyclePeriod.start);
      const cycleEndStr = formatDateOnly(cyclePeriod.end);

      // Match detectPaymentGaps logic:
      // - MIDMONTH: coverage only if payment has EXACT same start/end period (installments)
      // - CALENDAR: same exact match; for check-in partial month allow legacy full-month payments
      const hasPayment = sortedPayments.some((payment: any) => {
        const isPaying = payment.status === 'PAID' || payment.status === 'PARTIAL';
        if (!isPaying) return false;

        const pStartStr = new Date(payment.start_date).toISOString().split('T')[0];
        const pEndStr = new Date(payment.end_date).toISOString().split('T')[0];

        if (pStartStr === cycleStartStr && pEndStr === cycleEndStr) return true;

        if (cycleType === 'CALENDAR' && isFirstCycle) {
          const pStart = new Date(payment.start_date);
          const pEnd = new Date(payment.end_date);
          return pStart <= cyclePeriod.start && pEnd >= cyclePeriod.end;
        }

        return false;
      });
      
      // If no payment found for this cycle, add to unpaid months
      if (!hasPayment) {
        unpaidMonths.push({
          cycle_start: cycleStartStr,
          cycle_end: cycleEndStr,
          month: cyclePeriod.monthKey,
          month_name: cyclePeriod.monthName,
          year: cyclePeriod.year,
          month_number: cyclePeriod.monthNumber,
          cycle_type: cycleType,
        });
      }
      
      // Move to next cycle
      currentCycleStart = new Date(cyclePeriod.end);
      currentCycleStart.setDate(currentCycleStart.getDate() + 1);
      currentCycleStart.setHours(0, 0, 0, 0); // Reset to start of day

      isFirstCycle = false;
    }
    
    return unpaidMonths;
  }

  /**
   * Get CALENDAR cycle period (1st to last day of month)
   * Returns both Date objects and formatted strings
   */
  private getCalendarCyclePeriod(startDate: Date): any {
    const year = startDate.getFullYear();
    const month = startDate.getMonth();

    const formatDateOnly = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };

    // For check-in partial month (or any mid-month start), allow cycle start from the given date
    // and end at last day of month.
    const cycleStart = startDate.getDate() === 1 ? new Date(year, month, 1) : new Date(year, month, startDate.getDate());
    const cycleEnd = new Date(year, month + 1, 0);
    
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const monthName = cycleStart.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    return {
      start: cycleStart,
      end: cycleEnd,
      startStr: formatDateOnly(cycleStart),
      endStr: formatDateOnly(cycleEnd),
      monthKey,
      monthName,
      year,
      monthNumber: month + 1,
    };
  }

  /**
   * Get MIDMONTH cycle period (day X to day (X-1) of next month)
   * Follows the guide exactly: https://CALENDAR_VS_MIDMONTH_GUIDE.md
   * 
   * Logic:
   * 1. Start date: input date (day X of month)
   * 2. End date: same day of next month - 1 day
   * 
   * Example: Check-in 10 Dec 2025
   * Cycle 1: 10 Dec 2025 - 09 Jan 2026
   * Cycle 2: 10 Jan 2026 - 09 Feb 2026
   */
  private getMidmonthCyclePeriod(startDate: Date): any {
    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    const day = startDate.getDate();

    const formatDateOnly = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    
    // Start date is the input date
    const cycleStart = new Date(year, month, day);
    
    // End date: same day next month - 1
    // Create a temporary date for same day next month, then subtract 1 day
    const tempDate = new Date(year, month + 1, day);
    tempDate.setDate(tempDate.getDate() - 1);
    const cycleEnd = tempDate;
    
    // Month key and name based on cycle start
    const monthKey = `${cycleStart.getFullYear()}-${String(cycleStart.getMonth() + 1).padStart(2, '0')}`;
    const monthName = cycleStart.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    return {
      start: cycleStart,
      end: cycleEnd,
      startStr: formatDateOnly(cycleStart),
      endStr: formatDateOnly(cycleEnd),
      monthKey,
      monthName,
      year: cycleStart.getFullYear(),
      monthNumber: cycleStart.getMonth() + 1,
    };
  }

}
