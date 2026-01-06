import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionExpiryCronService {
  private readonly logger = new Logger(SubscriptionExpiryCronService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 */1 * * *', {
    name: 'subscription-expiry-normalization',
    timeZone: 'Asia/Kolkata',
  })
  async markExpiredSubscriptions() {
    const now = new Date();

    try {
      const result = await this.prisma.user_subscriptions.updateMany({
        where: {
          status: 'ACTIVE',
          end_date: { lt: now },
        },
        data: {
          status: 'EXPIRED',
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `✅ [CRON] Marked ${result.count} subscriptions as EXPIRED (end_date < now)`,
        );
      }
    } catch (error) {
      const err = error as { message?: string; stack?: string };
      this.logger.error(
        `❌ [CRON] Failed to mark expired subscriptions: ${err.message ?? 'Unknown error'}`,
        err.stack,
      );
    }
  }
}
