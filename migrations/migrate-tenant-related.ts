import { PrismaClient } from '@prisma/client';

const oldPrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'mysql://pgmanp7o_arun:arun30121998@116.206.105.148:3306/pgmanp7o_pg_management',
    },
  },
});

const newPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

function toBooleanWithDefault(value: any, defaultValue: boolean = false): boolean {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  return value === 1 || value === '1' || value === true;
}

async function main() {
  console.log('Starting tenant-related tables migration...\n');

  // ============================================================
  // STEP 1: MIGRATE TENANTS
  // ============================================================
  console.log('=== STEP 1: Migrating tenants ===');
  const oldTenants = await oldPrisma.$queryRaw<any[]>`SELECT * FROM tenants`;
  console.log(`Found ${oldTenants.length} tenants in old database`);

  if (oldTenants.length > 0) {
    const tenantData = oldTenants.map(tenant => ({
      s_no: tenant.s_no || tenant.id,
      tenant_id: tenant.tenant_id || tenant.tenantId,
      name: tenant.name,
      phone_no: tenant.phone_no || tenant.phoneNo,
      whatsapp_number: tenant.whatsapp_number || tenant.whatsappNumber,
      email: tenant.email,
      pg_id: tenant.pg_id || tenant.pgId,
      room_id: tenant.room_id || tenant.roomId,
      bed_id: tenant.bed_id || tenant.bedId,
      check_in_date: tenant.check_in_date || tenant.checkInDate,
      check_out_date: tenant.check_out_date || tenant.checkOutDate,
      status: tenant.status,
      created_at: tenant.created_at || tenant.createdAt,
      updated_at: tenant.updated_at || tenant.updatedAt,
      images: tenant.images,
      proof_documents: tenant.proof_documents || tenant.proofDocuments,
      is_deleted: toBooleanWithDefault(tenant.is_deleted || tenant.isDeleted, false),
      occupation: tenant.occupation,
      tenant_address: tenant.tenant_address || tenant.tenantAddress,
      city_id: tenant.city_id || tenant.cityId,
      state_id: tenant.state_id || tenant.stateId,
    }));
    await newPrisma.tenants.createMany({ data: tenantData, skipDuplicates: true });
  }
  console.log('Tenants migration completed\n');

  // ============================================================
  // STEP 2: MIGRATE RENT_PAYMENTS (from tenant_payments)
  // ============================================================
  console.log('=== STEP 2: Migrating rent_payments ===');
  const oldRentPayments = await oldPrisma.$queryRaw<any[]>`SELECT * FROM tenant_payments`;
  console.log(`Found ${oldRentPayments.length} rent_payments in old database`);

  if (oldRentPayments.length > 0) {
    const paymentData = oldRentPayments.map(payment => ({
      s_no: payment.s_no || payment.id,
      tenant_id: payment.tenant_id || payment.tenantId,
      pg_id: payment.pg_id || payment.pgId,
      room_id: payment.room_id || payment.roomId,
      bed_id: payment.bed_id || payment.bedId,
      cycle_id: null as number | null,
      amount_paid: payment.amount_paid || payment.amountPaid,
      payment_date: payment.payment_date || payment.paymentDate,
      payment_method: payment.payment_method || payment.paymentMethod,
      status: payment.status,
      remarks: payment.remarks,
      created_at: payment.created_at || payment.createdAt,
      updated_at: payment.updated_at || payment.updatedAt,
      is_deleted: toBooleanWithDefault(payment.is_deleted || payment.isDeleted, false),
      current_bill: payment.current_bill || payment.currentBill,
      actual_rent_amount: payment.actual_rent_amount || payment.actualRentAmount,
      current_bill_id: payment.current_bill_id || payment.currentBillId,
    }));
    await newPrisma.rent_payments.createMany({ data: paymentData, skipDuplicates: true });
  }
  console.log('Rent payments migration completed\n');

  // ============================================================
  // STEP 3: GENERATE TENANT_ALLOCATIONS
  // ============================================================
  console.log('=== STEP 3: Generating tenant_allocations ===');
  const newTenants = await newPrisma.tenants.findMany({
    where: { bed_id: { not: null } }
  });
  console.log(`Found ${newTenants.length} tenants for allocation creation`);

  for (const tenant of newTenants) {
    const existing = await newPrisma.tenant_allocations.findFirst({
      where: { tenant_id: tenant.s_no }
    });

    if (existing) continue;

    await newPrisma.tenant_allocations.create({
      data: {
        tenant_id: tenant.s_no,
        pg_id: tenant.pg_id || 0,
        room_id: tenant.room_id || 0,
        bed_id: tenant.bed_id || 0,
        effective_from: new Date(tenant.check_in_date),
        effective_to: tenant.check_out_date ? new Date(tenant.check_out_date) : null,
        bed_price_snapshot: 0,
      }
    });
  }
  console.log('Tenant allocations generated\n');

  // ============================================================
  // STEP 4: GENERATE TENANT_RENT_CYCLES
  // ============================================================
  console.log('=== STEP 4: Generating tenant_rent_cycles ===');
  const pgLocations = await newPrisma.pg_locations.findMany();
  const today = new Date();
  let totalCyclesCreated = 0;

  for (const tenant of newTenants) {
    const pg = pgLocations.find(p => p.s_no === tenant.pg_id);
    const cycleType = pg?.rent_cycle_type || 'CALENDAR';
    const anchorDay = new Date(tenant.check_in_date).getDate();
    const checkInDate = new Date(tenant.check_in_date);
    const checkOutDate = tenant.check_out_date ? new Date(tenant.check_out_date) : today;

    let currentCycleStart = new Date(checkInDate);
    let cycleIndex = 0;

    while (currentCycleStart <= checkOutDate && cycleIndex < 60) {
      let cycleStart: Date;
      let cycleEnd: Date;

      if (cycleType === 'CALENDAR') {
        cycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth(), 1);
        cycleEnd = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, 0);
      } else {
        cycleStart = new Date(currentCycleStart);
        cycleEnd = new Date(cycleStart);
        cycleEnd.setMonth(cycleEnd.getMonth() + 1);
        cycleEnd.setDate(cycleEnd.getDate() - 1);
      }

      const existing = await newPrisma.tenant_rent_cycles.findFirst({
        where: {
          tenant_id: tenant.s_no,
          cycle_start: cycleStart,
          cycle_end: cycleEnd
        }
      });

      if (!existing) {
        await newPrisma.tenant_rent_cycles.create({
          data: {
            tenant_id: tenant.s_no,
            cycle_type: cycleType,
            anchor_day: anchorDay,
            cycle_start: cycleStart,
            cycle_end: cycleEnd,
          }
        });
        totalCyclesCreated++;
      }

      currentCycleStart = new Date(cycleEnd);
      currentCycleStart.setDate(currentCycleStart.getDate() + 1);
      cycleIndex++;
    }
  }
  console.log(`Created ${totalCyclesCreated} rent cycles\n`);

  console.log('Tenant-related tables migration completed successfully!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await oldPrisma.$disconnect();
    await newPrisma.$disconnect();
  });
