import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Migration Script: Fix Tenant Rent Cycle Duplication and Link Null cycle_id
 * 
 * This script:
 * 1. Removes duplicate tenant_rent_cycles (keeps earliest created)
 * 2. Links existing rent_payments to correct cycles based on payment_date
 * 3. Creates missing cycles for payments without matching cycles
 * 4. Creates missing tenant_allocations for tenants
 */

interface CycleInfo {
  s_no: number;
  tenant_id: number;
  cycle_type: string;
  anchor_day: number;
  cycle_start: Date;
  cycle_end: Date;
  created_at: Date;
}

interface PaymentInfo {
  s_no: number;
  tenant_id: number;
  payment_date: Date | null;
  cycle_id: number | null;
}

async function main() {
  console.log('Starting tenant rent cycle migration...');

  // ============================================================
  // STEP 1: ANALYZE CURRENT STATE
  // ============================================================
  console.log('\n=== STEP 1: Analyzing current state ===');

  const duplicateCycles = await prisma.$queryRaw<Array<{
    tenant_id: number;
    cycle_start: Date;
    duplicate_count: bigint;
    cycle_ids: string;
  }>>`
    SELECT 
      tenant_id,
      cycle_start,
      COUNT(*) as duplicate_count,
      GROUP_CONCAT(s_no) as cycle_ids
    FROM tenant_rent_cycles
    GROUP BY tenant_id, cycle_start
    HAVING COUNT(*) > 1
  `;
  console.log(`Found ${duplicateCycles.length} duplicate cycle groups`);

  const paymentsWithNullCycleId = await prisma.rent_payments.count({
    where: { cycle_id: null },
  });
  console.log(`Found ${paymentsWithNullCycleId} payments with null cycle_id`);

  const paymentsWithCycleId = await prisma.rent_payments.count({
    where: { cycle_id: { not: null } },
  });
  console.log(`Found ${paymentsWithCycleId} payments with cycle_id`);

  // ============================================================
  // STEP 2: REMOVE DUPLICATE CYCLES
  // ============================================================
  console.log('\n=== STEP 3: Removing duplicate cycles ===');

  if (duplicateCycles.length > 0) {
    for (const duplicate of duplicateCycles) {
      // Find the earliest created cycle for this tenant_id + cycle_start combination
      const cycles = await prisma.tenant_rent_cycles.findMany({
        where: {
          tenant_id: duplicate.tenant_id,
          cycle_start: duplicate.cycle_start,
        },
        orderBy: { created_at: 'asc' },
      });

      if (cycles.length > 1) {
        const keepCycle = cycles[0];
        const deleteIds = cycles.slice(1).map(c => c.s_no);

        console.log(`Keeping cycle ${keepCycle.s_no}, deleting cycles: ${deleteIds.join(', ')}`);

        // Delete the duplicate cycles
        await prisma.tenant_rent_cycles.deleteMany({
          where: {
            s_no: { in: deleteIds },
          },
        });
      }
    }
  }

  // Verify duplicates removed
  const remainingDuplicates = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM (
      SELECT tenant_id, cycle_start
      FROM tenant_rent_cycles
      GROUP BY tenant_id, cycle_start
      HAVING COUNT(*) > 1
    ) as duplicates
  `;
  console.log(`Remaining duplicate cycle groups: ${remainingDuplicates[0].count}`);

  // ============================================================
  // STEP 4: CLEAN UP INVALID cycle_id REFERENCES
  // ============================================================
  console.log('\n=== STEP 4: Cleaning up invalid cycle_id references ===');

  // Remove cycle_id from payments where the cycle doesn't exist or doesn't belong to the tenant
  const invalidCyclePayments = await prisma.rent_payments.updateMany({
    where: {
      cycle_id: { not: null },
      OR: [
        {
          tenant_rent_cycles: null,
        },
        {
          tenant_rent_cycles: {
            tenant_id: { not: undefined }, // Will be handled in the loop
          },
        },
      ],
    },
    data: { cycle_id: null },
  });

  // More precise check: remove cycle_id if cycle doesn't belong to the tenant
  const allPaymentsWithCycleId = await prisma.rent_payments.findMany({
    where: { cycle_id: { not: null } },
    select: { s_no: true, tenant_id: true, cycle_id: true },
  });

  let invalidCount = 0;
  for (const payment of allPaymentsWithCycleId) {
    if (payment.cycle_id) {
      const cycle = await prisma.tenant_rent_cycles.findUnique({
        where: { s_no: payment.cycle_id },
      });

      if (!cycle || cycle.tenant_id !== payment.tenant_id) {
        await prisma.rent_payments.update({
          where: { s_no: payment.s_no },
          data: { cycle_id: null },
        });
        invalidCount++;
      }
    }
  }
  console.log(`Cleaned up ${invalidCount} invalid cycle_id references`);

  // ============================================================
  // STEP 5: LINK PAYMENTS TO CYCLES
  // ============================================================
  console.log('\n=== STEP 5: Linking payments to cycles ===');

  const paymentsWithoutCycle = await prisma.rent_payments.findMany({
    where: { cycle_id: null },
    select: { s_no: true, tenant_id: true, payment_date: true },
  });

  let linkedCount = 0;
  for (const payment of paymentsWithoutCycle) {
    if (payment.payment_date) {
      // Find the cycle that contains this payment date
      const matchingCycle = await prisma.tenant_rent_cycles.findFirst({
        where: {
          tenant_id: payment.tenant_id,
          cycle_start: { lte: payment.payment_date },
          cycle_end: { gte: payment.payment_date },
        },
      });

      if (matchingCycle) {
        await prisma.rent_payments.update({
          where: { s_no: payment.s_no },
          data: { cycle_id: matchingCycle.s_no },
        });
        linkedCount++;
      }
    }
  }
  console.log(`Linked ${linkedCount} payments to cycles`);

  // ============================================================
  // STEP 6: CREATE MISSING CYCLES FOR UNLINKED PAYMENTS
  // ============================================================
  console.log('\n=== STEP 6: Creating missing cycles for unlinkable payments ===');

  const stillUnlinkedPayments = await prisma.rent_payments.findMany({
    where: { cycle_id: null },
    include: {
      tenants: {
        include: {
          pg_locations: {
            select: { rent_cycle_type: true, rent_cycle_start: true },
          },
        },
      },
    },
  });

  let createdCycles = 0;
  for (const payment of stillUnlinkedPayments) {
    if (payment.payment_date && payment.tenants?.pg_locations) {
      const cycleType = payment.tenants.pg_locations.rent_cycle_type || 'CALENDAR';
      const anchorDay = payment.tenants.pg_locations.rent_cycle_start || 1;
      const paymentDate = new Date(payment.payment_date);

      // Calculate cycle start and end based on cycle type
      let cycleStart: Date;
      let cycleEnd: Date;

      if (cycleType === 'CALENDAR') {
        // Calendar cycle: 1st to last day of month
        cycleStart = new Date(Date.UTC(paymentDate.getUTCFullYear(), paymentDate.getUTCMonth(), 1));
        cycleEnd = new Date(Date.UTC(paymentDate.getUTCFullYear(), paymentDate.getUTCMonth() + 1, 0));
      } else {
        // MIDMONTH cycle: anchor_day to anchor_day - 1 of next month
        const startMonth = paymentDate.getUTCDate() >= anchorDay ? paymentDate.getUTCMonth() : paymentDate.getUTCMonth() - 1;
        const startYear = paymentDate.getUTCFullYear();

        cycleStart = new Date(Date.UTC(startYear, startMonth, anchorDay));

        // Calculate end date: same day next month - 1
        const nextMonth = startMonth + 1;
        const nextYear = startMonth > 11 ? startYear + 1 : startYear;
        const endMonth = nextMonth > 11 ? 0 : nextMonth;

        const tempDate = new Date(Date.UTC(nextYear, endMonth, anchorDay));
        tempDate.setUTCDate(tempDate.getUTCDate() - 1);
        cycleEnd = tempDate;
      }

      // Create or update the cycle
      const cycle = await prisma.tenant_rent_cycles.upsert({
        where: {
          tenant_id_cycle_start: {
            tenant_id: payment.tenant_id,
            cycle_start: cycleStart,
          },
        },
        create: {
          tenant_id: payment.tenant_id,
          cycle_type: cycleType,
          anchor_day: anchorDay,
          cycle_start: cycleStart,
          cycle_end: cycleEnd,
        },
        update: {},
      });

      // Link the payment to the cycle
      await prisma.rent_payments.update({
        where: { s_no: payment.s_no },
        data: { cycle_id: cycle.s_no },
      });

      createdCycles++;
    }
  }
  console.log(`Created ${createdCycles} new cycles and linked payments`);

  // ============================================================
  // STEP 7: CREATE MISSING TENANT_ALLOCATIONS
  // ============================================================
  console.log('\n=== STEP 7: Creating missing tenant_allocations ===');

  const tenantsWithoutAllocations = await prisma.tenants.findMany({
    where: {
      bed_id: { not: null },
      tenant_allocations: {
        none: {},
      },
    },
    include: {
      beds: {
        select: { bed_price: true },
      },
    },
  });

  let createdAllocations = 0;
  for (const tenant of tenantsWithoutAllocations) {
    await prisma.tenant_allocations.create({
      data: {
        tenant_id: tenant.s_no,
        pg_id: tenant.pg_id || 0,
        room_id: tenant.room_id || 0,
        bed_id: tenant.bed_id || 0,
        effective_from: new Date(tenant.check_in_date),
        effective_to: null,
        bed_price_snapshot: Number(tenant.beds?.bed_price || 0),
      },
    });
    createdAllocations++;
  }
  console.log(`Created ${createdAllocations} tenant_allocations`);

  // ============================================================
  // STEP 8: VERIFICATION
  // ============================================================
  console.log('\n=== STEP 8: Verification ===');

  const finalDuplicateCycles = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM (
      SELECT tenant_id, cycle_start
      FROM tenant_rent_cycles
      GROUP BY tenant_id, cycle_start
      HAVING COUNT(*) > 1
    ) as duplicates
  `;
  console.log(`Duplicate cycles after migration: ${finalDuplicateCycles[0].count}`);

  const finalPaymentsWithNullCycleId = await prisma.rent_payments.count({
    where: { cycle_id: null },
  });
  console.log(`Payments with null cycle_id after migration: ${finalPaymentsWithNullCycleId}`);

  const finalPaymentsWithCycleId = await prisma.rent_payments.count({
    where: { cycle_id: { not: null } },
  });
  console.log(`Payments with cycle_id after migration: ${finalPaymentsWithCycleId}`);

  const cycleStats = await prisma.tenant_rent_cycles.groupBy({
    by: ['tenant_id'],
    _count: { s_no: true },
  });
  console.log(`Tenants with cycles: ${cycleStats.length}`);
  console.log(`Total cycles: ${cycleStats.reduce((sum, c) => sum + c._count.s_no, 0)}`);

  console.log('\n=== Migration completed successfully ===');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
