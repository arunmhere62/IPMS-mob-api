import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function truncateTables() {
  console.log('Starting table truncation...');

  try {
    // Disable foreign key checks
    await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 0`;
    console.log('Foreign key checks disabled');

    // Truncate tables in order
    await prisma.$executeRaw`TRUNCATE TABLE rent_payments`;
    console.log('Truncated rent_payments');

    await prisma.$executeRaw`TRUNCATE TABLE tenant_rent_cycles`;
    console.log('Truncated tenant_rent_cycles');

    await prisma.$executeRaw`TRUNCATE TABLE tenant_allocations`;
    console.log('Truncated tenant_allocations');

    await prisma.$executeRaw`TRUNCATE TABLE beds`;
    console.log('Truncated beds');

    // Re-enable foreign key checks
    await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 1`;
    console.log('Foreign key checks re-enabled');

    console.log('Table truncation completed successfully');
  } catch (error) {
    console.error('Error during truncation:', error);
    // Ensure foreign key checks are re-enabled even if error occurs
    await prisma.$executeRaw`SET FOREIGN_KEY_CHECKS = 1`;
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

truncateTables().catch(console.error);
