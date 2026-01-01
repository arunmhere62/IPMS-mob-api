import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../../prisma/prisma.service';
import { NotificationService } from '../../../notification/notification.service';
import { PendingPaymentService } from '../pending-payment.service';

@Injectable()
export class PendingPaymentCronService {
  private readonly logger = new Logger(PendingPaymentCronService.name);

  constructor(
    private pendingPaymentService: PendingPaymentService,
    private notificationService: NotificationService,
    private prisma: PrismaService,
  ) {}

  @Cron('0 */6 * * *', {
    name: 'check-pending-rent-payments',
    timeZone: 'Asia/Kolkata',
  })
  async checkPendingRentPayments() {
    this.logger.log('🔔 [CRON] Starting pending rent payment check...');

    try {
      const pendingPayments = await this.pendingPaymentService.getAllPendingPayments();

      if (pendingPayments.length === 0) {
        this.logger.log('✅ [CRON] No pending rent payments found');
        return;
      }

      this.logger.log(`📊 [CRON] Found ${pendingPayments.length} tenants with pending rent`);

      const tenantsByOwner = await this.groupTenantsByOwner(pendingPayments);

      for (const [ownerId, tenants] of Object.entries(tenantsByOwner)) {
        await this.sendPendingRentNotification(parseInt(ownerId), tenants);
      }

      this.logger.log('✅ [CRON] Pending rent payment check completed');
    } catch (error) {
      this.logger.error(
        `❌ [CRON] Error checking pending rent payments: ${error.message}`,
        error.stack,
      );
    }
  }

  @Cron('0 9 * * *', {
    name: 'daily-payment-reminder',
    timeZone: 'Asia/Kolkata',
  })
  async sendDailyPaymentReminder() {
    this.logger.log('🔔 [CRON] Starting daily payment reminder...');

    try {
      const tenantsDueToday =
        await this.pendingPaymentService.getTenantsWithPaymentDueTomorrow();

      if (tenantsDueToday.length === 0) {
        this.logger.log('✅ [CRON] No payments due today');
        return;
      }

      this.logger.log(
        `📊 [CRON] Found ${tenantsDueToday.length} tenants with payment due today`,
      );

      const tenantsByOwner = await this.groupTenantsByOwnerFromDueList(tenantsDueToday);

      for (const [ownerId, tenants] of Object.entries(tenantsByOwner)) {
        await this.sendPaymentDueNotification(parseInt(ownerId), tenants);
      }

      this.logger.log('✅ [CRON] Daily payment reminder completed');
    } catch (error) {
      this.logger.error(
        `❌ [CRON] Error sending daily payment reminder: ${error.message}`,
        error.stack,
      );
    }
  }

  private async groupTenantsByOwner(pendingPayments: any[]) {
    const tenantsByUser: Record<number, any[]> = {};

    for (const payment of pendingPayments) {
      const tenant = await this.prisma.tenants.findUnique({
        where: { s_no: payment.tenant_id },
        select: {
          s_no: true,
          pg_id: true,
        },
      });

      if (!tenant?.pg_id) {
        continue;
      }

      // Notify all active users assigned to this PG
      const assignments = await this.prisma.pg_users.findMany({
        where: {
          pg_id: tenant.pg_id,
          is_active: true,
        },
        select: {
          user_id: true,
        },
      });

      for (const a of assignments) {
        if (!tenantsByUser[a.user_id]) {
          tenantsByUser[a.user_id] = [];
        }
        tenantsByUser[a.user_id].push(payment);
      }
    }

    return tenantsByUser;
  }

  private async groupTenantsByOwnerFromDueList(tenantsDue: any[]) {
    const tenantsByUser: Record<number, any[]> = {};

    for (const tenant of tenantsDue) {
      const tenantDetails = await this.prisma.tenants.findUnique({
        where: { s_no: tenant.tenant_id },
        select: {
          s_no: true,
          pg_id: true,
        },
      });

      if (!tenantDetails?.pg_id) {
        continue;
      }

      const assignments = await this.prisma.pg_users.findMany({
        where: {
          pg_id: tenantDetails.pg_id,
          is_active: true,
        },
        select: {
          user_id: true,
        },
      });

      for (const a of assignments) {
        if (!tenantsByUser[a.user_id]) {
          tenantsByUser[a.user_id] = [];
        }
        tenantsByUser[a.user_id].push(tenant);
      }
    }

    return tenantsByUser;
  }

  private async sendPendingRentNotification(ownerId: number, tenants: any[]) {
    try {
      const totalPending = tenants.reduce((sum, t) => sum + t.total_pending, 0);
      const tenantCount = tenants.length;

      const title = '💰 Pending Rent Payments';
      const body = `${tenantCount} tenant${tenantCount > 1 ? 's have' : ' has'} pending rent totaling ₹${totalPending.toFixed(2)}`;

      const result = await this.notificationService.sendToUser(ownerId, {
        title,
        body,
        type: 'PENDING_RENT',
        data: {
          tenant_count: tenantCount,
          total_pending: totalPending,
        },
      });

      this.logger.log(
        `✅ [CRON] Sent pending rent notification to owner ${ownerId}: ${tenantCount} tenants, ₹${totalPending.toFixed(2)}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ [CRON] Failed to send notification to owner ${ownerId}: ${error.message}`,
      );
    }
  }

  private async sendPaymentDueNotification(ownerId: number, tenants: any[]) {
    try {
      const tenantCount = tenants.length;

      const title = '⏰ Payment Due Today';
      const body = `${tenantCount} tenant${tenantCount > 1 ? 's have' : ' has'} rent payment due today`;

      const result = await this.notificationService.sendToUser(ownerId, {
        title,
        body,
        type: 'PAYMENT_DUE_TODAY',
        data: {
          tenant_count: tenantCount,
        },
      });

      this.logger.log(
        `✅ [CRON] Sent payment due notification to owner ${ownerId}: ${tenantCount} tenants`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `❌ [CRON] Failed to send payment due notification to owner ${ownerId}: ${error.message}`,
      );
    }
  }

  async triggerPendingRentCheck() {
    this.logger.log('🔧 [MANUAL] Manually triggered pending rent check');
    await this.checkPendingRentPayments();
  }

  async triggerPendingRentCheckForUser(userId: number) {
    this.logger.log(
      `🔧 [MANUAL] Manually triggered pending rent check for user ${userId}`,
    );
    const result = await this.checkPendingRentPaymentsForUser(userId);
    return result;
  }

  async triggerDailyReminder() {
    this.logger.log('🔧 [MANUAL] Manually triggered daily reminder');
    await this.sendDailyPaymentReminder();
  }

  private async checkPendingRentPaymentsForUser(userId: number) {
    const assignments = await this.prisma.pg_users.findMany({
      where: {
        user_id: userId,
        is_active: true,
      },
      select: {
        pg_id: true,
      },
    });

    const pgIds = assignments.map((a) => a.pg_id);
    if (pgIds.length === 0) {
      this.logger.log(`✅ [CRON] No PG locations found for user ${userId}`);
      return { success: true, tenantCount: 0, totalPending: 0 };
    }

    const pendingLists = await Promise.all(
      pgIds.map((pgId) => this.pendingPaymentService.getAllPendingPayments(pgId)),
    );
    const pendingPayments = pendingLists.flat();

    if (pendingPayments.length === 0) {
      this.logger.log(`✅ [CRON] No pending rent payments for user ${userId}`);
      return { success: true, tenantCount: 0, totalPending: 0 };
    }

    const totalPending = pendingPayments.reduce(
      (sum, t) => sum + (t.total_pending || 0),
      0,
    );
    await this.sendPendingRentNotification(userId, pendingPayments);

    return {
      success: true,
      tenantCount: pendingPayments.length,
      totalPending,
    };
  }
}
