import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from '../../modules/dashboard/dashboard.service';
import { NotificationService } from '../../modules/notification/notification.service';

const OWNER_ADMIN_ROLE_NAMES = ['ADMIN', 'SUPER_ADMIN'];

type PgLite = { s_no: number; location_name: string | null };

@Injectable()
export class DashboardRentNotificationsCronService {
  private readonly logger = new Logger(DashboardRentNotificationsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
    private readonly notificationService: NotificationService,
  ) {}

  private isEnabled() {
    return String(process.env.CRON_JOB ?? '').toLowerCase() === 'true';
  }

  async runPartialRentSummary(params: { force?: boolean } = {}) {
    if (!params.force && !this.isEnabled()) return;

    this.logger.log('🔔 [CRON] Sending partial rent summary notifications...');

    const pgs = await this.getActivePgs();
    for (const pg of pgs) {
      try {
        const widgets = await this.dashboardService.getTenantStatusWidgets({ pg_id: pg.s_no });
        const partialCount = Number((widgets as { partial_rent?: { count?: unknown } })?.partial_rent?.count ?? 0);
        await this.notifyPartialRentCountForPg({ pg, count: partialCount });
      } catch (error) {
        this.logger.error(
          `❌ [CRON] Failed partial summary for pg=${pg.s_no}: ${error.message}`,
          error.stack,
        );
      }
    }
  }

  async runPendingRentSummary(params: { force?: boolean } = {}) {
    if (!params.force && !this.isEnabled()) return;

    this.logger.log('🔔 [CRON] Sending pending rent summary notifications...');

    const pgs = await this.getActivePgs();
    for (const pg of pgs) {
      try {
        const widgets = await this.dashboardService.getTenantStatusWidgets({ pg_id: pg.s_no });
        const pendingCount = Number((widgets as { pending_rent?: { count?: unknown } })?.pending_rent?.count ?? 0);
        await this.notifyPendingRentCountForPg({ pg, count: pendingCount });
      } catch (error) {
        this.logger.error(
          `❌ [CRON] Failed pending summary for pg=${pg.s_no}: ${error.message}`,
          error.stack,
        );
      }
    }
  }

  private normalizeRoleName(roleName: unknown) {
    return String(roleName ?? '').trim().toUpperCase();
  }

  private async getActivePgs(): Promise<PgLite[]> {
    const pgs = await this.prisma.pg_locations.findMany({
      where: {
        is_deleted: false,
        status: 'ACTIVE',
      },
      select: {
        s_no: true,
        location_name: true,
      },
    });

    return pgs as PgLite[];
  }

  private async getOwnerAdminUsersForPg(pgId: number): Promise<Array<{ userId: number; roleName: string }>> {
    const assignments = await this.prisma.pg_users.findMany({
      where: {
        pg_id: pgId,
        is_active: true,
        users: {
          is_deleted: false,
          status: 'ACTIVE',
        },
      },
      select: {
        user_id: true,
        users: {
          select: {
            roles: {
              select: {
                role_name: true,
              },
            },
          },
        },
      },
    });

    const out: Array<{ userId: number; roleName: string }> = [];
    for (const a of assignments) {
      const roleName = this.normalizeRoleName((a as { users?: { roles?: { role_name?: unknown } } }).users?.roles?.role_name);
      if (OWNER_ADMIN_ROLE_NAMES.includes(roleName)) {
        out.push({ userId: a.user_id, roleName });
      }
    }

    // De-dupe by userId
    const uniq = new Map<number, { userId: number; roleName: string }>();
    for (const u of out) {
      if (!uniq.has(u.userId)) uniq.set(u.userId, u);
    }
    return Array.from(uniq.values());
  }

  private async notifyPartialRentCountForPg(params: { pg: PgLite; count: number }) {
    const { pg, count } = params;
    if (count <= 0) return;

    const recipients = await this.getOwnerAdminUsersForPg(pg.s_no);
    if (recipients.length === 0) return;

    const title = '⚠️ Partial Rent Pending';
    const body = `${count} tenant${count === 1 ? '' : 's'} have partial rent pending in ${pg.location_name ?? 'your PG'}.`;

    for (const r of recipients) {
      await this.notificationService.sendToUser(r.userId, {
        title,
        body,
        type: 'PARTIAL_RENT_SUMMARY',
        data: {
          pg_id: pg.s_no,
          partial_count: count,
        },
      });
    }
  }

  private async notifyPendingRentCountForPg(params: { pg: PgLite; count: number }) {
    const { pg, count } = params;
    if (count <= 0) return;

    const recipients = await this.getOwnerAdminUsersForPg(pg.s_no);
    if (recipients.length === 0) return;

    const title = '🔔 Rent Pending';
    const body = `${count} tenant${count === 1 ? '' : 's'} have rent pending in ${pg.location_name ?? 'your PG'}.`;

    for (const r of recipients) {
      await this.notificationService.sendToUser(r.userId, {
        title,
        body,
        type: 'PENDING_RENT_SUMMARY',
        data: {
          pg_id: pg.s_no,
          pending_count: count,
        },
      });
    }
  }

  @Cron('0 10,21 * * *', {
    name: 'dashboard-rent-notifications-partial',
    timeZone: 'Asia/Kolkata',
  })
  async sendPartialRentSummaryNotifications() {
    await this.runPartialRentSummary({ force: false });
  }

  @Cron('0 10,21 * * *', {
    name: 'dashboard-rent-notifications-pending',
    timeZone: 'Asia/Kolkata',
  })
  async sendPendingRentSummaryNotifications() {
    await this.runPendingRentSummary({ force: false });
  }
}
