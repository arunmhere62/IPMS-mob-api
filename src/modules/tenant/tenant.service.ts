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
import { TenantRentSummaryService } from './tenant-rent-summary.service';

@Injectable()
export class TenantService {
  constructor(
    private prisma: PrismaService,
    private tenantStatusService: TenantStatusService,
    private tenantRentSummaryService: TenantRentSummaryService,
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
    const parseDateOnlyToUtc = (input: string): Date => {
      const datePart = String(input || '').slice(0, 10);
      const match = /^\d{4}-\d{2}-\d{2}$/.exec(datePart);
      if (!match) return new Date(NaN);
      const [y, m, d] = datePart.split('-').map((n) => Number(n));
      return new Date(Date.UTC(y, m - 1, d));
    };

    const effectiveFromDateOnly = parseDateOnlyToUtc(dto.effective_from);
    if (Number.isNaN(effectiveFromDateOnly.getTime())) {
      throw new BadRequestException('Invalid effective_from date. Please provide a valid date.');
    }

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

    const checkInDateOnly = parseDateOnlyToUtc(tenant.check_in_date.toISOString());
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
      where.OR = [{ name: { contains: search } }];
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
      const rentSummary = this.tenantRentSummaryService.buildRentSummary({ tenant });
      const rentFlags = this.tenantStatusService.deriveRentFlags({
        paymentStatus: rentSummary.payment_status,
        unpaidMonthsCount: rentSummary.unpaid_months?.length || 0,
        partialDueAmount: rentSummary.partial_due_amount || 0,
      });

      return {
        ...statusEnriched,
        is_rent_paid: rentFlags.is_rent_paid,
        is_rent_partial: rentFlags.is_rent_partial,
        rent_due_amount: rentSummary.rent_due_amount,
        partial_due_amount: rentSummary.partial_due_amount,
        pending_due_amount: rentSummary.pending_due_amount,
        rent_cycle: rentSummary.rent_cycle,
        payment_status: rentSummary.payment_status,
        partial_payments: rentSummary.partial_payments,
        total_partial_due: rentSummary.total_partial_due,
        unpaid_months: rentSummary.unpaid_months,
        rent_payments: tenant.rent_payments,
        advance_payments: tenant.advance_payments,
        refund_payments: tenant.refund_payments,
        payment_cycle_summaries: rentSummary.payment_cycle_summaries,
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
            cycle_id: true,
            payment_method: true,
            remarks: true,
            status: true,
            tenant_rent_cycles: {
              select: {
                s_no: true,
                cycle_type: true,
                cycle_start: true,
                cycle_end: true,
              },
            },
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

    const rentSummary = this.tenantRentSummaryService.buildRentSummary({ tenant });
    const paymentStatus = rentSummary.payment_status || 'NO_PAYMENT';

    const transferDifferenceDueCycle = (() => {
      const allocations = (tenant as any).tenant_allocations || [];
      if (!allocations || allocations.length <= 1) return null;

      const toDateOnlyUtcLocal = (input: any): Date => {
        const d = input instanceof Date ? input : new Date(input);
        if (Number.isNaN(d.getTime())) return new Date(NaN);
        return new Date(d.toISOString().split('T')[0] + 'T00:00:00.000Z');
      };

      // Identify most recent transfer allocation (exclude initial check-in allocation)
      const checkInDateOnly = toDateOnlyUtcLocal(tenant.check_in_date);
      const transferAllocations = allocations
        .filter((a: any) => {
          const ef = toDateOnlyUtcLocal(a.effective_from);
          if (Number.isNaN(ef.getTime())) return false;
          return ef.getTime() !== checkInDateOnly.getTime();
        })
        .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());

      if (transferAllocations.length === 0) return null;
      const transferDate = toDateOnlyUtcLocal(transferAllocations[0].effective_from);
      if (Number.isNaN(transferDate.getTime())) return null;

      const candidate = rentSummary.payment_cycle_summaries.find((c: any) => {
        const start = toDateOnlyUtcLocal(String(c.start_date));
        const end = toDateOnlyUtcLocal(String(c.end_date));
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
        return transferDate >= start && transferDate <= end;
      });

      if (!candidate) return null;

      const remaining = Number(candidate.remainingDue || 0);
      if (!(remaining > 0)) return null;

      const todayUtc = toDateOnlyUtcLocal(new Date());
      const candidateStartUtc = toDateOnlyUtcLocal(String(candidate.start_date));
      if (Number.isNaN(candidateStartUtc.getTime())) return null;
      if (candidateStartUtc.getTime() > todayUtc.getTime()) return null;

      return candidate;
    })();

    const unpaidMonths = this.getUnpaidMonthsWithCycleDates(
      tenant.check_in_date,
      tenant.check_out_date,
      (tenant as any).tenant_rent_cycles || [],
      (tenant as any).rent_payments || [],
    );

    const rentFlags = this.tenantStatusService.deriveRentFlags({
      paymentStatus,
      unpaidMonthsCount: unpaidMonths.length,
      partialDueAmount: rentSummary.partial_due_amount || 0,
    });

    const cycleSummaryById = new Map<number, any>();
    (rentSummary.payment_cycle_summaries || []).forEach((s: any) => {
      if (s?.cycle_id) cycleSummaryById.set(Number(s.cycle_id), s);
    });

    const enrichedRentPayments = (tenant as any).rent_payments?.map((p: any) => {
      const cycleSummary = p?.cycle_id ? cycleSummaryById.get(Number(p.cycle_id)) : null;
      const remaining = cycleSummary ? Number(cycleSummary.remainingDue || 0) : null;
      return {
        ...p,
        cycle_status: cycleSummary?.status ?? null,
        cycle_due: cycleSummary?.due ?? null,
        cycle_total_paid: cycleSummary?.totalPaid ?? null,
        cycle_remaining_due: remaining,
        is_cycle_settled: remaining !== null ? remaining <= 0 : null,
      };
    });

    return ResponseUtil.success(
      {
        ...enrichedTenant,
        is_rent_paid: rentFlags.is_rent_paid,
        is_rent_partial: rentFlags.is_rent_partial,
        rent_due_amount: rentSummary.rent_due_amount,
        partial_due_amount: rentSummary.partial_due_amount,
        pending_due_amount: rentSummary.pending_due_amount,
        rent_payments: enrichedRentPayments,
        unpaid_months: unpaidMonths,
        payment_status: paymentStatus,
        payment_cycle_summaries: rentSummary.payment_cycle_summaries,
        transfer_difference_due_cycle: transferDifferenceDueCycle,
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

    const toDateOnly = (d: any): string => {
      if (!d) return '';
      try {
        const dt = d instanceof Date ? d : new Date(d);
        return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().split('T')[0];
      } catch {
        return '';
      }
    };

    const requestedCheckIn = updateTenantDto.check_in_date ? toDateOnly(updateTenantDto.check_in_date) : '';
    const existingCheckIn = toDateOnly(existingTenant.check_in_date);
    const isCheckInChanging = !!requestedCheckIn && requestedCheckIn !== existingCheckIn;
    const isRoomChanging =
      updateTenantDto.room_id !== undefined
      && updateTenantDto.room_id !== null
      && Number(updateTenantDto.room_id) !== Number(existingTenant.room_id);
    const isBedChanging =
      updateTenantDto.bed_id !== undefined
      && updateTenantDto.bed_id !== null
      && Number(updateTenantDto.bed_id) !== Number(existingTenant.bed_id);

    if (isCheckInChanging || isRoomChanging || isBedChanging) {
      const [hasRentPayments, hasAdvance, hasRefund, hasBills] = await Promise.all([
        this.prisma.rent_payments.count({ where: { tenant_id: id, is_deleted: false } }),
        this.prisma.advance_payments.count({ where: { tenant_id: id, is_deleted: false } }),
        this.prisma.refund_payments.count({ where: { tenant_id: id, is_deleted: false } }),
        this.prisma.current_bills.count({ where: { tenant_id: id, is_deleted: false } }),
      ]);

      const lockTenancyFacts =
        (hasRentPayments ?? 0) > 0 || (hasAdvance ?? 0) > 0 || (hasRefund ?? 0) > 0 || (hasBills ?? 0) > 0;

      if (lockTenancyFacts) {
        throw new BadRequestException(
          'Once rent is generated or any payment exists, Check-in date, Room, and Bed cannot be changed. Please contact support if you need to make this change.',
        );
      }
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
    tenantCycles: any[],
    rentPayments: any[],
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

    const endCutoff = endDate;
    const cycles = (tenantCycles || [])
      .map((c: any) => ({
        ...c,
        cycle_start: new Date(c.cycle_start),
        cycle_end: new Date(c.cycle_end),
      }))
      .filter((c: any) => c.cycle_start <= endCutoff)
      .sort((a: any, b: any) => a.cycle_start.getTime() - b.cycle_start.getTime());

    const paidByCycle = new Map<number, number>();
    rentPayments.forEach((p: any) => {
      if (!p.cycle_id) return;
      const isPaying = p.status === 'PAID' || p.status === 'PARTIAL';
      if (!isPaying) return;
      const prev = paidByCycle.get(p.cycle_id) || 0;
      paidByCycle.set(p.cycle_id, prev + Number(p.amount_paid || 0));
    });

    cycles.forEach((c: any) => {
      const startStr = formatDateOnly(c.cycle_start);
      const endStr = formatDateOnly(c.cycle_end);
      const totalPaid = paidByCycle.get(c.s_no) || 0;

      if (totalPaid <= 0) {
        unpaidMonths.push({
          cycle_id: c.s_no,
          cycle_start: startStr,
          cycle_end: endStr,
          month: `${c.cycle_start.getFullYear()}-${String(c.cycle_start.getMonth() + 1).padStart(2, '0')}`,
          month_name: c.cycle_start.toLocaleString('default', { month: 'long', year: 'numeric' }),
          year: c.cycle_start.getFullYear(),
          month_number: c.cycle_start.getMonth() + 1,
          cycle_type: c.cycle_type,
        });
      }
    });

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
