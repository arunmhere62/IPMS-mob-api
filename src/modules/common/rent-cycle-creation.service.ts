import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

type CycleType = 'CALENDAR' | 'MIDMONTH';

type CycleWindow = {
  cycleStart: Date;
  cycleEnd: Date;
  /** Logical next month index (0-based, before clamping) — used to advance cursor */
  logicalNextYear: number;
  logicalNextMonth: number;
  anchorDay: number;
};

type TenantRow = {
  s_no: number;
  check_in_date: Date;
  pg_locations?: { rent_cycle_type?: string | null; rent_cycle_start?: number | null } | null;
};

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Responsible for creating tenant_rent_cycles rows in the database.
 *
 * Key design decisions:
 *  - All writes use createMany + skipDuplicates → fully idempotent, safe to call multiple times.
 *  - The DB has UNIQUE(tenant_id, cycle_start), so no duplicates can ever be inserted.
 *  - Cycle math is extracted from the existing computeCycleWindow algorithm (rent-payment.service.ts)
 *    to keep behaviour consistent.
 *  - "Today" is always computed in IST (UTC+5:30) so midnight cron runs are correct.
 */
@Injectable()
export class RentCycleCreationService {
  private readonly logger = new Logger(RentCycleCreationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Create rent cycles inside an existing Prisma transaction.
   * Use this during tenant creation so cycles are written atomically
   * alongside the tenant and allocation records — no extra DB read needed.
   *
   * @param tx    - The Prisma transaction client
   * @param data  - Tenant data already available in memory (no extra DB fetch)
   */
  async createCyclesInTx(
    tx: { tenant_rent_cycles: { createMany: (args: unknown) => Promise<{ count: number }> } },
    data: {
      tenantId: number;
      checkInDate: Date;
      cycleType: CycleType;
      anchorDay: number;
    },
  ): Promise<{ created: number }> {
    const { tenantId, checkInDate, cycleType, anchorDay } = data;
    const checkIn = this._toUtcMidnight(new Date(checkInDate));
    const todayIST = this._todayIST();

    const cycles = this._computeAllCycles(checkIn, todayIST, cycleType, checkInDate);
    if (cycles.length === 0) return { created: 0 };

    // Note: During tenant creation in a transaction, we cannot query existing cycles
    // for overlap detection since the tenant is being created. However, the
    // UNIQUE(tenant_id, cycle_start) constraint will prevent duplicates.
    // Overlap detection is handled in _createForTenant for manual triggers.

    const result = await tx.tenant_rent_cycles.createMany({
      data: cycles.map((c) => ({
        tenant_id: tenantId,
        cycle_type: cycleType,
        anchor_day: anchorDay,
        cycle_start: c.cycleStart,
        cycle_end: c.cycleEnd,
      })),
      skipDuplicates: true,
    } as never);

    return { created: (result as { count: number }).count };
  }

  /**
   * Create all missing rent cycles for a single tenant, from check-in up to today (IST).
   * Safe to call at any time — skips cycles that already exist.
   */
  async createMissingCycles(tenantId: number): Promise<{ created: number }> {
    const tenant = await this.prisma.tenants.findUnique({
      where: { s_no: tenantId },
      select: {
        s_no: true,
        check_in_date: true,
        pg_locations: { select: { rent_cycle_type: true, rent_cycle_start: true } },
      },
    });

    if (!tenant) return { created: 0 };
    return this._createForTenant(tenant);
  }

  /**
   * Create all missing rent cycles for every active tenant.
   * Optionally scoped to a single PG for testing.
   */
  async createMissingCyclesForAllActiveTenants(
    pgId?: number,
  ): Promise<{ created: number; skipped: number; errors: number }> {
    const tenants = await this.prisma.tenants.findMany({
      where: {
        is_deleted: false,
        status: 'ACTIVE',
        ...(pgId ? { pg_id: pgId } : {}),
      },
      select: {
        s_no: true,
        check_in_date: true,
        pg_locations: { select: { rent_cycle_type: true, rent_cycle_start: true } },
      },
    });

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const tenant of tenants) {
      try {
        const result = await this._createForTenant(tenant);
        if (result.created > 0) {
          created += result.created;
        } else {
          skipped++;
        }
      } catch (err) {
        this.logger.error(`Failed to create cycles for tenant ${tenant.s_no}: ${(err as Error).message}`);
        errors++;
      }
    }

    return { created, skipped, errors };
  }

  // ─── Core Logic ─────────────────────────────────────────────────────────────

  private async _createForTenant(tenant: TenantRow): Promise<{ created: number }> {
    const cycleType = this._cycleType(tenant);
    const checkIn = this._toUtcMidnight(new Date(tenant.check_in_date));
    const anchorDay = cycleType === 'MIDMONTH'
      ? checkIn.getUTCDate()
      : (tenant.pg_locations?.rent_cycle_start ?? 1);

    const todayIST = this._todayIST();

    // Compute every cycle from check-in up to and including today
    const cycles = this._computeAllCycles(checkIn, todayIST, cycleType, tenant.check_in_date);

    if (cycles.length === 0) return { created: 0 };

    // Fetch existing cycles to check for overlaps
    const existingCycles = await this.prisma.tenant_rent_cycles.findMany({
      where: { tenant_id: tenant.s_no },
      select: { cycle_start: true, cycle_end: true, s_no: true },
    });

    // Filter out computed cycles that overlap with existing cycles
    const nonOverlappingCycles = cycles.filter((computed) => {
      return !existingCycles.some((existing) => {
        const existingStart = this._toUtcMidnight(new Date(existing.cycle_start));
        const existingEnd = this._toUtcMidnight(new Date(existing.cycle_end));
        // Check for overlap: (start1 <= end2) && (start2 <= end1)
        return computed.cycleStart <= existingEnd && existingStart <= computed.cycleEnd;
      });
    });

    if (nonOverlappingCycles.length < cycles.length) {
      this.logger.warn(
        `Tenant ${tenant.s_no}: filtered out ${cycles.length - nonOverlappingCycles.length} overlapping cycles, creating ${nonOverlappingCycles.length}`,
      );
    }

    if (nonOverlappingCycles.length === 0) return { created: 0 };

    const result = await this.prisma.tenant_rent_cycles.createMany({
      data: nonOverlappingCycles.map((c) => ({
        tenant_id: tenant.s_no,
        cycle_type: cycleType,
        anchor_day: anchorDay,
        cycle_start: c.cycleStart,
        cycle_end: c.cycleEnd,
      })),
      skipDuplicates: true, // UNIQUE(tenant_id, cycle_start) — safe to call repeatedly
    });

    if (result.count > 0) {
      this.logger.log(`Created ${result.count} cycle(s) for tenant ${tenant.s_no}`);
    } else {
      this.logger.log(`Skipped tenant ${tenant.s_no} - cycles already exist`);
    }

    return { created: result.count };
  }

  /**
   * Walk through cycles from check-in to today and collect them all.
   * Uses the same computeCycleWindow algorithm as rent-payment.service.ts
   * to ensure consistent cycle boundaries.
   */
  private _computeAllCycles(
    checkIn: Date,
    today: Date,
    cycleType: CycleType,
    checkInDate: Date,
  ): CycleWindow[] {
    const cycles: CycleWindow[] = [];
    const MAX = 200; // safety guard against infinite loops

    // Start from check-in date and compute the first cycle
    let cursor = new Date(checkIn);

    for (let i = 0; i < MAX; i++) {
      const window = this._computeCycleWindow(cycleType, checkInDate, cursor);

      // Only collect cycles that have started (cycle_start <= today)
      if (window.cycleStart > today) {
        if (cycles.length === 0) {
          cycles.push(window);
        }
        break;
      }

      // Only collect cycles that start on or after check-in
      if (window.cycleStart >= checkIn) {
        cycles.push(window);
      }

      // If this cycle covers today, we're done
      if (window.cycleEnd >= today) break;

      // Advance cursor to the next cycle's start date.
      // Use the next cycle's start as the new cursor to ensure forward progress.
      // This is computed as: cycleEnd + 1, which should equal the next cycle's start
      const nextCursor = new Date(window.cycleEnd);
      nextCursor.setUTCDate(nextCursor.getUTCDate() + 1);
      cursor = nextCursor;
    }

    return cycles;
  }

  // ─── Cycle Math (ported from rent-payment.service.ts) ─────────────────────

  /**
   * Compute the cycle window (start + end) that contains referenceDate.
   *
   * CALENDAR:
   *   - Check-in month → starts on check-in day (proration)
   *   - All subsequent months → 1st to last day of month
   *
   * MIDMONTH:
   *   - Anchor day = tenant check-in day
   *   - Cycle = anchorDay of logicalMonth → (anchorDay of logicalMonth+1) - 1
   *   - Clamped to handle months shorter than anchorDay (e.g. anchor=31 in Feb)
   */
  private _computeCycleWindow(
    cycleType: CycleType,
    checkInDate: Date,
    referenceDate: Date,
  ): CycleWindow {
    const ref = this._toUtcMidnight(referenceDate);
    const checkIn = this._toUtcMidnight(new Date(checkInDate));
    const anchorDay = checkIn.getUTCDate();

    const refY = ref.getUTCFullYear();
    const refM = ref.getUTCMonth(); // 0-based
    const refD = ref.getUTCDate();

    if (cycleType === 'CALENDAR') {
      const isCheckInMonth =
        ref.getUTCFullYear() === checkIn.getUTCFullYear() &&
        ref.getUTCMonth() === checkIn.getUTCMonth();

      const cycleStart = isCheckInMonth
        ? checkIn
        : new Date(Date.UTC(refY, refM, 1));
      const cycleEnd = new Date(Date.UTC(refY, refM + 1, 0)); // last day of month

      return {
        cycleStart,
        cycleEnd,
        anchorDay,
        logicalNextYear: refY,
        logicalNextMonth: refM + 1,
      };
    }

    // MIDMONTH — anchor day is the tenant's check-in day
    // Determine which logical month this cycle belongs to:
    //   if today's day >= anchorDay → cycle started this month
    //   if today's day <  anchorDay → cycle started last month
    const startMonth = refD >= anchorDay ? refM : refM - 1;

    // cycleStart clamped (e.g. anchor=31 in Feb → Feb 28)
    const cycleStart = this._makeUtcDateClamped(refY, startMonth, anchorDay);

    // nextStart uses LOGICAL startMonth+1 (before clamping) to avoid infinite loop
    // when clamped month and next month resolve to the same cursor position
    const nextStart = this._makeUtcDateClamped(refY, startMonth + 1, anchorDay);

    // cycleEnd = one day before the next anchor
    const cycleEnd = new Date(nextStart);
    cycleEnd.setUTCDate(cycleEnd.getUTCDate() - 1);

    return {
      cycleStart,
      cycleEnd,
      anchorDay,
      logicalNextYear: refY,
      logicalNextMonth: startMonth + 1,
    };
  }

  // ─── Date Helpers ────────────────────────────────────────────────────────────

  /** Clamp day to the last valid day of the given month */
  private _makeUtcDateClamped(year: number, month: number, day: number): Date {
    // Normalise month overflow/underflow (e.g. month=-1 → Dec of previous year)
    const base = new Date(Date.UTC(year, month, 1));
    const normYear = base.getUTCFullYear();
    const normMonth = base.getUTCMonth();
    const lastDay = new Date(Date.UTC(normYear, normMonth + 1, 0)).getUTCDate();
    return new Date(Date.UTC(normYear, normMonth, Math.min(day, lastDay)));
  }

  /** Strip time component — return UTC midnight for the given date */
  private _toUtcMidnight(d: Date): Date {
    return new Date(d.toISOString().split('T')[0] + 'T00:00:00.000Z');
  }

  /**
   * "Today" expressed as UTC midnight of the current IST date.
   * IST = UTC + 5:30.  Shifting the UTC timestamp by 5.5 h and then reading
   * the UTC year/month/day gives us the correct IST calendar date.
   */
  private _todayIST(): Date {
    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return new Date(
      Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()),
    );
  }

  private _cycleType(tenant: TenantRow): CycleType {
    const type = tenant.pg_locations?.rent_cycle_type;
    if (type === 'MIDMONTH') return 'MIDMONTH';
    if (type === 'CALENDAR') return 'CALENDAR';
    this.logger.warn(`Tenant ${tenant.s_no}: Invalid rent_cycle_type '${type}', defaulting to CALENDAR`);
    return 'CALENDAR';
  }
}
