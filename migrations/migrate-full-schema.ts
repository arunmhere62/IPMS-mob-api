import { PrismaClient } from '@prisma/client';

const newPrisma = new PrismaClient();
const oldPrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'mysql://pgmanp7o_arun:arun30121998@116.206.105.148:3306/pgmanp7o_pg_management'
    }
  }
});

function toBoolean(value: any): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  return value === 1 || value === '1' || value === true;
}

function toBooleanWithDefault(value: any, defaultValue: boolean = false): boolean {
  const result = toBoolean(value);
  return result !== null ? result : defaultValue;
}

async function main() {
  console.log('Starting full schema migration from old to new database...\n');

  // ============================================================
  // STEP 1: MIGRATE COUNTRY
  // ============================================================
  console.log('=== STEP 1: Migrating country ===');
  const oldCountries = await oldPrisma.$queryRaw<any[]>`SELECT * FROM country`;
  console.log(`Found ${oldCountries.length} countries in old database`);

  if (oldCountries.length > 0) {
    const countryData = oldCountries.map(country => ({
      s_no: country.s_no || country.id,
      name: country.name,
      iso_code: country.iso_code || country.isoCode,
      flag: country.flag,
      phone_code: country.phone_code || country.phoneCode,
      currency: country.currency,
      latitude: country.latitude,
      longitude: country.longitude,
    }));
    await newPrisma.country.createMany({ data: countryData, skipDuplicates: true });
  }
  console.log('Country migration completed\n');

  // ============================================================
  // STEP 2: MIGRATE STATE
  // ============================================================
  console.log('=== STEP 2: Migrating state ===');
  const oldStates = await oldPrisma.$queryRaw<any[]>`SELECT * FROM state`;
  console.log(`Found ${oldStates.length} states in old database`);

  if (oldStates.length > 0) {
    const stateData = oldStates.map(state => ({
      s_no: state.s_no || state.id,
      name: state.name,
      iso_code: state.iso_code || state.isoCode,
      country_code: state.country_code || state.countryCode,
      latitude: state.latitude,
      longitude: state.longitude,
    }));
    await newPrisma.state.createMany({ data: stateData, skipDuplicates: true });
  }
  console.log('State migration completed\n');

  // ============================================================
  // STEP 3: MIGRATE CITY
  // ============================================================
  console.log('=== STEP 3: Migrating city ===');
  const oldCities = await oldPrisma.$queryRaw<any[]>`SELECT * FROM city`;
  console.log(`Found ${oldCities.length} cities in old database`);

  if (oldCities.length > 0) {
    const cityData = oldCities.map(city => ({
      s_no: city.s_no || city.id,
      name: city.name,
      country_code: city.country_code || city.countryCode,
      state_code: city.state_code || city.stateCode,
      latitude: city.latitude,
      longitude: city.longitude,
    }));
    await newPrisma.city.createMany({ data: cityData, skipDuplicates: true });
  }
  console.log('City migration completed\n');

  // ============================================================
  // STEP 4: MIGRATE ORGANIZATION
  // ============================================================
  console.log('=== STEP 4: Migrating organization ===');
  const oldOrgs = await oldPrisma.$queryRaw<any[]>`SELECT * FROM organization`;
  console.log(`Found ${oldOrgs.length} organizations in old database`);

  if (oldOrgs.length > 0) {
    const orgData = oldOrgs.map(org => ({
      s_no: org.s_no || org.id,
      name: org.name,
      description: org.description,
      superadmin_id: null as number | null, // Set to null temporarily to avoid circular dependency with users
      created_at: org.created_at || org.createdAt,
      updated_at: org.updated_at || org.updatedAt,
      deleted_at: org.deleted_at || org.deletedAt,
      created_by: org.created_by || org.createdBy,
      updated_by: org.updated_by || org.updatedBy,
      deleted_by: org.deleted_by || org.deletedBy,
      is_deleted: toBooleanWithDefault(org.is_deleted || org.isDeleted),
      status: 'ACTIVE' as const,
    }));
    await newPrisma.organization.createMany({ data: orgData, skipDuplicates: true });
  }
  console.log('Organization migration completed\n');

  // ============================================================
  // STEP 5: MIGRATE ROLES
  // ============================================================
  console.log('=== STEP 5: Migrating roles ===');
  const oldRoles = await oldPrisma.$queryRaw<any[]>`SELECT * FROM roles`;
  console.log(`Found ${oldRoles.length} roles in old database`);

  if (oldRoles.length > 0) {
    const roleData = oldRoles.map(role => ({
      s_no: role.s_no || role.id,
      role_name: role.role_name || role.roleName,
      permissions: {},
      status: role.status,
      created_at: role.created_at || role.createdAt,
      updated_at: role.updated_at || role.updatedAt,
      is_deleted: toBooleanWithDefault(role.is_deleted || role.isDeleted),
    }));
    await newPrisma.roles.createMany({ data: roleData, skipDuplicates: true });
  }
  console.log('Roles migration completed\n');

  // ============================================================
  // STEP 6: MIGRATE USERS
  // ============================================================
  console.log('=== STEP 6: Migrating users ===');
  const oldUsers = await oldPrisma.$queryRaw<any[]>`SELECT * FROM users`;
  console.log(`Found ${oldUsers.length} users in old database`);

  if (oldUsers.length > 0) {
    const userData = oldUsers.map(user => ({
      s_no: user.s_no || user.id,
      name: user.name,
      email: user.email,
      password: user.password,
      phone: user.phone,
      status: user.status,
      created_at: user.created_at || user.createdAt,
      updated_at: user.updated_at || user.updatedAt,
      role_id: user.role_id || user.roleId,
      is_deleted: toBooleanWithDefault(user.is_deleted || user.isDeleted),
      organization_id: user.organization_id || user.organizationId,
      address: user.address,
      city_id: user.city_id || user.cityId,
      state_id: user.state_id || user.stateId,
      pincode: user.pincode,
      country: user.country,
      gender: user.gender,
      proof_documents: user.proof_documents || user.proofDocuments,
      profile_images: user.profile_images || user.profileImages,
    }));
    await newPrisma.users.createMany({ data: userData, skipDuplicates: true });
  }
  console.log('Users migration completed\n');

  // ============================================================
  // STEP 7: MIGRATE PG_LOCATIONS
  // ============================================================
  console.log('=== STEP 7: Migrating pg_locations ===');
  const oldPgLocations = await oldPrisma.$queryRaw<any[]>`SELECT * FROM pg_locations`;
  console.log(`Found ${oldPgLocations.length} pg_locations in old database`);

  if (oldPgLocations.length > 0) {
    const pgData = oldPgLocations.map(pg => ({
      s_no: pg.s_no || pg.id,
      location_name: pg.location_name || pg.locationName,
      address: pg.address,
      pincode: pg.pincode,
      rent_cycle_start: 1,
      rent_cycle_end: 31,
      rent_cycle_type: 'CALENDAR' as const,
      created_at: pg.created_at || pg.createdAt,
      updated_at: pg.updated_at || pg.updatedAt,
      status: pg.status,
      images: pg.images,
      city_id: pg.city_id || pg.cityId,
      state_id: pg.state_id || pg.stateId,
      organization_id: pg.organization_id || pg.organizationId,
      is_deleted: toBooleanWithDefault(pg.is_deleted || pg.isDeleted),
      pg_type: 'COLIVING' as const,
    }));
    await newPrisma.pg_locations.createMany({ data: pgData, skipDuplicates: true });
  }
  console.log('PG locations migration completed\n');

  // ============================================================
  // STEP 8: MIGRATE ROOMS
  // ============================================================
  console.log('=== STEP 8: Migrating rooms ===');
  const oldRooms = await oldPrisma.$queryRaw<any[]>`SELECT * FROM rooms`;
  console.log(`Found ${oldRooms.length} rooms in old database`);

  if (oldRooms.length > 0) {
    const roomData = oldRooms.map(room => ({
      s_no: room.s_no || room.id,
      room_id: room.room_id || room.roomId,
      pg_id: room.pg_id || room.pgId,
      room_no: room.room_no || room.roomNo,
      created_at: room.created_at || room.createdAt,
      updated_at: room.updated_at || room.updatedAt,
      images: room.images,
      is_deleted: toBooleanWithDefault(room.is_deleted || room.isDeleted),
    }));
    await newPrisma.rooms.createMany({ data: roomData, skipDuplicates: true });
  }
  console.log('Rooms migration completed\n');

  // ============================================================
  // STEP 9: MIGRATE BEDS
  // ============================================================
  console.log('=== STEP 9: Migrating beds ===');
  
  // First get room prices from old database
  const roomPrices = await oldPrisma.$queryRaw<any[]>`SELECT s_no, rent_price FROM rooms WHERE rent_price IS NOT NULL AND rent_price > 0`;
  const roomRentMap = new Map<number, number>();
  for (const room of roomPrices) {
    roomRentMap.set(room.s_no, Number(room.rent_price));
  }
  console.log(`Loaded ${roomRentMap.size} room prices`);

  const oldBeds = await oldPrisma.$queryRaw<any[]>`SELECT * FROM beds`;
  console.log(`Found ${oldBeds.length} beds in old database`);

  if (oldBeds.length > 0) {
    const bedData = oldBeds.map(bed => {
      const roomId = bed.room_id || bed.roomId;
      const bedPrice = roomId ? (roomRentMap.get(roomId) || 0) : 0;
      return {
        s_no: bed.s_no || bed.id,
        bed_no: bed.bed_no || bed.bedNo,
        room_id: roomId,
        pg_id: bed.pg_id || bed.pgId,
        images: bed.images,
        created_at: bed.created_at || bed.createdAt,
        updated_at: bed.updated_at || bed.updatedAt,
        is_deleted: toBooleanWithDefault(bed.is_deleted || bed.isDeleted),
        bed_price: bedPrice,
      };
    });
    await newPrisma.beds.createMany({ data: bedData, skipDuplicates: true });
  }
  console.log('Beds migration completed\n');

  // ============================================================
  // STEP 10: MIGRATE TENANTS
  // ============================================================
  console.log('=== STEP 10: Migrating tenants ===');
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
      is_deleted: toBooleanWithDefault(tenant.is_deleted || tenant.isDeleted),
      occupation: tenant.occupation,
      tenant_address: tenant.tenant_address || tenant.tenantAddress,
      city_id: tenant.city_id || tenant.cityId,
      state_id: tenant.state_id || tenant.stateId,
    }));
    await newPrisma.tenants.createMany({ data: tenantData, skipDuplicates: true });
  }
  console.log('Tenants migration completed\n');

  // ============================================================
  // STEP 11: MIGRATE VISITORS
  // ============================================================
  console.log('=== STEP 11: Migrating visitors ===');
  const oldVisitors = await oldPrisma.$queryRaw<any[]>`SELECT * FROM visitors`;
  console.log(`Found ${oldVisitors.length} visitors in old database`);

  if (oldVisitors.length > 0) {
    const visitorData = oldVisitors.map(visitor => ({
      s_no: visitor.s_no || visitor.id,
      pg_id: visitor.pg_id || visitor.pgId,
      visitor_name: visitor.visitor_name || visitor.visitorName,
      phone_no: visitor.phone_no || visitor.phoneNo,
      purpose: visitor.purpose,
      visited_date: visitor.visited_date || visitor.visitedDate,
      created_at: visitor.created_at || visitor.createdAt,
      updated_at: visitor.updated_at || visitor.updatedAt,
      visited_room_id: visitor.visited_room_id || visitor.visitedRoomId,
      visited_bed_id: visitor.visited_bed_id || visitor.visitedBedId,
      is_deleted: toBooleanWithDefault(visitor.is_deleted || visitor.isDeleted),
      address: visitor.address,
      city_id: visitor.city_id || visitor.cityId,
      state_id: visitor.state_id || visitor.stateId,
      convertedTo_tenant: toBooleanWithDefault(visitor.convertedTo_tenant || visitor.convertedToTenant),
    }));
    await newPrisma.visitors.createMany({ data: visitorData, skipDuplicates: true });
  }
  console.log('Visitors migration completed\n');

  // ============================================================
  // STEP 12: MIGRATE EXPENSES
  // ============================================================
  console.log('=== STEP 12: Migrating expenses ===');
  const oldExpenses = await oldPrisma.$queryRaw<any[]>`SELECT * FROM expenses`;
  console.log(`Found ${oldExpenses.length} expenses in old database`);

  if (oldExpenses.length > 0) {
    const expenseData = oldExpenses.map(expense => ({
      s_no: expense.s_no || expense.id,
      pg_id: expense.pg_id || expense.pgId,
      expense_type: expense.expense_type || expense.expenseType,
      amount: expense.amount,
      paid_to: expense.paid_to || expense.paidTo,
      paid_date: expense.paid_date || expense.paidDate,
      payment_method: expense.payment_method || expense.paymentMethod,
      remarks: expense.remarks,
      created_at: expense.created_at || expense.createdAt,
      updated_at: expense.updated_at || expense.updatedAt,
      is_deleted: toBooleanWithDefault(expense.is_deleted || expense.isDeleted),
    }));
    await newPrisma.expenses.createMany({ data: expenseData, skipDuplicates: true });
  }
  console.log('Expenses migration completed\n');

  // ============================================================
  // STEP 13: MIGRATE ADVANCE_PAYMENTS
  // ============================================================
  console.log('=== STEP 13: Migrating advance_payments ===');
  const oldAdvancePayments = await oldPrisma.$queryRaw<any[]>`SELECT * FROM advance_payments`;
  console.log(`Found ${oldAdvancePayments.length} advance_payments in old database`);

  if (oldAdvancePayments.length > 0) {
    const paymentData = oldAdvancePayments.map(payment => ({
      s_no: payment.s_no || payment.id,
      tenant_id: payment.tenant_id || payment.tenantId,
      pg_id: payment.pg_id || payment.pgId,
      room_id: payment.room_id || payment.roomId,
      bed_id: payment.bed_id || payment.bedId,
      amount_paid: payment.amount_paid || payment.amountPaid,
      payment_date: payment.payment_date || payment.paymentDate,
      payment_method: payment.payment_method || payment.paymentMethod,
      remarks: payment.remarks,
      created_at: payment.created_at || payment.createdAt,
      updated_at: payment.updated_at || payment.updatedAt,
      status: payment.status,
      is_deleted: toBooleanWithDefault(payment.is_deleted || payment.isDeleted),
      actual_rent_amount: payment.actual_rent_amount || payment.actualRentAmount,
    }));
    await newPrisma.advance_payments.createMany({ data: paymentData, skipDuplicates: true });
  }
  console.log('Advance payments migration completed\n');

  // ============================================================
  // STEP 14: MIGRATE REFUND_PAYMENTS
  // ============================================================
  console.log('=== STEP 14: Migrating refund_payments ===');
  const oldRefundPayments = await oldPrisma.$queryRaw<any[]>`SELECT * FROM refund_payments`;
  console.log(`Found ${oldRefundPayments.length} refund_payments in old database`);

  if (oldRefundPayments.length > 0) {
    const paymentData = oldRefundPayments.map(payment => ({
      s_no: payment.s_no || payment.id,
      tenant_id: payment.tenant_id || payment.tenantId,
      pg_id: payment.pg_id || payment.pgId,
      room_id: payment.room_id || payment.roomId,
      bed_id: payment.bed_id || payment.bedId,
      amount_paid: payment.amount_paid || payment.amountPaid,
      payment_date: payment.payment_date || payment.paymentDate,
      payment_method: payment.payment_method || payment.paymentMethod,
      remarks: payment.remarks,
      created_at: payment.created_at || payment.createdAt,
      updated_at: payment.updated_at || payment.updatedAt,
      status: payment.status,
      is_deleted: toBooleanWithDefault(payment.is_deleted || payment.isDeleted),
      actual_rent_amount: payment.actual_rent_amount || payment.actualRentAmount,
    }));
    await newPrisma.refund_payments.createMany({ data: paymentData, skipDuplicates: true });
  }
  console.log('Refund payments migration completed\n');

  // ============================================================
  // STEP 15: MIGRATE CURRENT_BILLS
  // ============================================================
  console.log('=== STEP 15: Migrating current_bills ===');
  const oldCurrentBills = await oldPrisma.$queryRaw<any[]>`SELECT * FROM current_bills`;
  console.log(`Found ${oldCurrentBills.length} current_bills in old database`);

  if (oldCurrentBills.length > 0) {
    const billData = oldCurrentBills.map(bill => ({
      s_no: bill.s_no || bill.id,
      tenant_id: bill.tenant_id || bill.tenantId,
      pg_id: bill.pg_id || bill.pgId,
      bill_amount: bill.bill_amount || bill.billAmount,
      bill_date: bill.bill_date || bill.billDate,
      created_at: bill.created_at || bill.createdAt,
      updated_at: bill.updated_at || bill.updatedAt,
      is_deleted: toBooleanWithDefault(bill.is_deleted || bill.isDeleted),
    }));
    await newPrisma.current_bills.createMany({ data: billData, skipDuplicates: true });
  }
  console.log('Current bills migration completed\n');

  // ============================================================
  // STEP 16: MIGRATE RENT_PAYMENTS (from tenant_payments)
  // ============================================================
  console.log('=== STEP 16: Migrating rent_payments ===');
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
      is_deleted: toBooleanWithDefault(payment.is_deleted || payment.isDeleted),
      current_bill: payment.current_bill || payment.currentBill,
      actual_rent_amount: payment.actual_rent_amount || payment.actualRentAmount,
      current_bill_id: payment.current_bill_id || payment.currentBillId,
    }));
    await newPrisma.rent_payments.createMany({ data: paymentData, skipDuplicates: true });
  }
  console.log('Rent payments migration completed\n');

  // ============================================================
  // STEP 17: GENERATE TENANT_ALLOCATIONS
  // ============================================================
  console.log('=== STEP 17: Generating tenant_allocations ===');
  const newTenants = await newPrisma.tenants.findMany({
    where: { bed_id: { not: null } }
  });
  console.log(`Found ${newTenants.length} tenants for allocation creation`);

  // Fetch all beds to get their prices
  const beds = await newPrisma.beds.findMany({
    select: { s_no: true, bed_price: true }
  });
  const bedPriceMap = new Map<number, number>();
  for (const bed of beds) {
    bedPriceMap.set(bed.s_no, Number(bed.bed_price));
  }

  for (const tenant of newTenants) {
    const existing = await newPrisma.tenant_allocations.findFirst({
      where: { tenant_id: tenant.s_no }
    });

    if (existing) continue;

    const bedPrice = tenant.bed_id ? (bedPriceMap.get(tenant.bed_id) || 0) : 0;

    await newPrisma.tenant_allocations.create({
      data: {
        tenant_id: tenant.s_no,
        pg_id: tenant.pg_id || 0,
        room_id: tenant.room_id || 0,
        bed_id: tenant.bed_id || 0,
        effective_from: new Date(tenant.check_in_date),
        effective_to: tenant.check_out_date ? new Date(tenant.check_out_date) : null,
        bed_price_snapshot: bedPrice,
      }
    });
  }
  console.log('Tenant allocations generated\n');

  // ============================================================
  // STEP 18: GENERATE TENANT_RENT_CYCLES
  // ============================================================
  console.log('=== STEP 18: Generating tenant_rent_cycles ===');
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

  // ============================================================
  // STEP 19: LINK RENT_PAYMENTS TO TENANT_RENT_CYCLES
  // ============================================================
  console.log('=== STEP 19: Linking rent_payments to tenant_rent_cycles ===');
  
  // Fetch old payments with start_date for accurate cycle matching
  const oldPaymentsForLinking = await oldPrisma.$queryRaw<any[]>`SELECT s_no, tenant_id, start_date FROM tenant_payments`;
  const paymentStartDateMap = new Map<number, Date>();
  for (const payment of oldPaymentsForLinking) {
    paymentStartDateMap.set(payment.s_no, new Date(payment.start_date));
  }
  console.log(`Loaded ${paymentStartDateMap.size} payment start dates from old database`);

  const rentPayments = await newPrisma.rent_payments.findMany({
    where: { cycle_id: null }
  });
  console.log(`Found ${rentPayments.length} payments to link`);

  let linkedCount = 0;
  for (const payment of rentPayments) {
    const cycles = await newPrisma.tenant_rent_cycles.findMany({
      where: { tenant_id: payment.tenant_id }
    });

    // Use start_date from old database for matching instead of created_at
    // This handles cases where payment is created late (e.g., in second month)
    const paymentStartDate = paymentStartDateMap.get(payment.s_no);
    const matchingCycle = cycles.find(c =>
      paymentStartDate && paymentStartDate >= c.cycle_start && paymentStartDate <= c.cycle_end
    );

    if (matchingCycle) {
      await newPrisma.rent_payments.update({
        where: { s_no: payment.s_no },
        data: { cycle_id: matchingCycle.s_no }
      });
      linkedCount++;
    }
  }
  console.log(`Linked ${linkedCount} payments to cycles\n`);

  // ============================================================
  // VERIFICATION
  // ============================================================
  console.log('=== Verification ===');

  const countryCount = await newPrisma.country.count();
  const stateCount = await newPrisma.state.count();
  const cityCount = await newPrisma.city.count();
  const orgCount = await newPrisma.organization.count();
  const roleCount = await newPrisma.roles.count();
  const userCount = await newPrisma.users.count();
  const pgCount = await newPrisma.pg_locations.count();
  const roomCount = await newPrisma.rooms.count();
  const bedCount = await newPrisma.beds.count();
  const tenantCount = await newPrisma.tenants.count();
  const visitorCount = await newPrisma.visitors.count();
  const expenseCount = await newPrisma.expenses.count();
  const advanceCount = await newPrisma.advance_payments.count();
  const refundCount = await newPrisma.refund_payments.count();
  const billCount = await newPrisma.current_bills.count();
  const rentPaymentCount = await newPrisma.rent_payments.count();
  const allocationCount = await newPrisma.tenant_allocations.count();
  const cycleCount = await newPrisma.tenant_rent_cycles.count();
  const linkedPaymentCount = await newPrisma.rent_payments.count({
    where: { cycle_id: { not: null } }
  });

  console.log(`Country: ${countryCount}`);
  console.log(`State: ${stateCount}`);
  console.log(`City: ${cityCount}`);
  console.log(`Organization: ${orgCount}`);
  console.log(`Roles: ${roleCount}`);
  console.log(`Users: ${userCount}`);
  console.log(`PG Locations: ${pgCount}`);
  console.log(`Rooms: ${roomCount}`);
  console.log(`Beds: ${bedCount}`);
  console.log(`Tenants: ${tenantCount}`);
  console.log(`Visitors: ${visitorCount}`);
  console.log(`Expenses: ${expenseCount}`);
  console.log(`Advance Payments: ${advanceCount}`);
  console.log(`Refund Payments: ${refundCount}`);
  console.log(`Current Bills: ${billCount}`);
  console.log(`Rent Payments: ${rentPaymentCount}`);
  console.log(`Tenant Allocations: ${allocationCount}`);
  console.log(`Rent Cycles: ${cycleCount}`);
  console.log(`Payments with cycle_id: ${linkedPaymentCount}`);

  console.log('\n=== Migration completed ===');
}

main()
  .catch(console.error)
  .finally(async () => {
    await newPrisma.$disconnect();
    await oldPrisma.$disconnect();
  });
