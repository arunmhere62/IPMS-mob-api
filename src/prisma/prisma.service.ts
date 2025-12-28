import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDbTiming } from '../common/utils/performance-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: ['query', 'info', 'warn', 'error'],
    });

    this.$use(async (params, next) => {
      const start = process.hrtime.bigint();
      const result = await next(params);
      const end = process.hrtime.bigint();
      const ms = Number(end - start) / 1_000_000;
      addDbTiming(ms);
      return result;
    });
  }

  async onModuleInit() {
    const maxRetries = 5;
    const retryDelay = 3000; // 3 seconds
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.$connect();
        console.log('✅ Database connected successfully');
        return;
      } catch (error) {
        console.error(`❌ Database connection attempt ${attempt}/${maxRetries} failed:`, error.message);
        
        if (attempt === maxRetries) {
          console.error('🚨 All database connection attempts failed. Please check:');
          console.error('  1. DATABASE_URL is correct');
          console.error('  2. Database server is running and accessible');
          console.error('  3. Firewall allows connections from Render IPs');
          console.error('  4. Database credentials are valid');
          throw error;
        }
        
        console.log(`⏳ Retrying in ${retryDelay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('👋 Database disconnected');
  }
}
