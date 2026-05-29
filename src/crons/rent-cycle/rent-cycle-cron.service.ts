import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RentCycleCreationService } from '../../modules/common/rent-cycle-creation.service';

/**
 * Runs every night at midnight IST (UTC+5:30 = 18:30 UTC).
 * Creates any missing tenant_rent_cycles rows for all active tenants.
 *
 * Safe to run multiple times — createMany uses skipDuplicates:true
 * and the DB has UNIQUE(tenant_id, cycle_start), so no duplicates possible.
 */
@Injectable()
export class RentCycleCronService {
  private readonly logger = new Logger(RentCycleCronService.name);

  constructor(private readonly rentCycleCreationService: RentCycleCreationService) {}

  // 18:30 UTC = 00:00 IST
  @Cron('30 18 * * *', { timeZone: 'UTC' })
  async runNightly(): Promise<void> {
    this.logger.log('Rent cycle cron started');
    const result = await this.rentCycleCreationService.createMissingCyclesForAllActiveTenants();
    this.logger.log(
      `Rent cycle cron finished — created: ${result.created}, skipped: ${result.skipped}, errors: ${result.errors}`,
    );
  }

  /** Manual trigger for all PGs (testing / backfill) */
  async triggerAll(): Promise<{ created: number; skipped: number; errors: number }> {
    return this.rentCycleCreationService.createMissingCyclesForAllActiveTenants();
  }

  /** Manual trigger scoped to a single PG (testing) */
  async triggerForPg(pgId: number): Promise<{ created: number; skipped: number; errors: number }> {
    return this.rentCycleCreationService.createMissingCyclesForAllActiveTenants(pgId);
  }
}
