import { PrismaClient } from '@prisma/client';

const oldPrisma = new PrismaClient({
  datasources: {
    db: {
      url: 'mysql://pgmanp7o_arun:arun30121998@116.206.105.148:3306/pgmanp7o_pg_management',
    },
  },
});

const newPrisma = new PrismaClient();

async function updateBedPrices() {
  console.log('Starting bed price update...\n');

  // Get all rooms with their rent prices from old database
  const oldRooms = await oldPrisma.$queryRaw<any[]>`SELECT s_no, rent_price FROM rooms WHERE rent_price IS NOT NULL AND rent_price > 0`;
  console.log(`Found ${oldRooms.length} rooms with rent prices in old database`);

  // Create a map of room_id to rent_price
  const roomRentMap = new Map<number, number>();
  for (const room of oldRooms) {
    roomRentMap.set(room.s_no, Number(room.rent_price));
  }

  // Update beds in batches using raw SQL for better performance
  let updatedCount = 0;
  for (const [roomId, rentPrice] of roomRentMap) {
    const result = await newPrisma.$executeRaw`
      UPDATE beds 
      SET bed_price = ${rentPrice}
      WHERE room_id = ${roomId} 
        AND is_deleted = 0
    `;
    updatedCount += result;
    console.log(`Updated beds for room ${roomId} with price ${rentPrice}`);
  }

  console.log(`\nUpdated ${updatedCount} beds with room rent prices`);
  await oldPrisma.$disconnect();
  await newPrisma.$disconnect();
}

updateBedPrices().catch(console.error);
