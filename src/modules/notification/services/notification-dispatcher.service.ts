import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Expo } from 'expo-server-sdk';
import { getErrorMessage } from '../utils/error.util';
import { getFirebaseApp } from '../providers/firebase.provider';
import { PushNotificationService } from './push-notification.service';
import { NotificationHistoryService } from './notification-history.service';
import { SendNotificationDto } from '../types/notification.types';

const firebaseApp = getFirebaseApp();

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushNotificationService,
    private readonly historyService: NotificationHistoryService,
  ) {}

  async sendToExpoToken(token: string, notification: SendNotificationDto) {
    return this.pushService.sendToExpoToken(token, notification);
  }

  /**
   * Send a push notification to a user by their userId.
   */
  async sendToUser(userId: number, notification: SendNotificationDto) {
    try {
      this.logger.log(
        `📤 sendToUser user=${userId} title=${notification.title} type=${notification.type}`,
      );

      // Get user's active tokens
      const tokens = await this.prisma.user_fcm_tokens.findMany({
        where: {
          user_id: userId,
          is_active: true,
        },
        select: {
          fcm_token: true,
          device_id: true,
          updated_at: true,
          created_at: true,
        },
      });

      if (tokens.length === 0) {
        this.logger.warn(`⚠️ No tokens found for user ${userId}`);
        return { success: false, message: 'No tokens found' };
      }

      const normalized = tokens
        .map((t) => ({
          fcm_token: t.fcm_token,
          device_id: t.device_id ?? null,
          updated_at: t.updated_at,
          created_at: t.created_at,
        }))
        .filter((t) => typeof t.fcm_token === 'string' && t.fcm_token.length > 0);

      const uniqueTokens = this.pushService.dedupeActiveTokens(normalized);
      const allTokens = uniqueTokens.map((t) => t.fcm_token);

      // Separate Expo tokens from Firebase tokens
      const expoTokens = allTokens.filter((token) => Expo.isExpoPushToken(token));
      const firebaseTokens = allTokens.filter((token) => !Expo.isExpoPushToken(token));

      this.logger.log(
        `🔎 user=${userId} tokens_total=${allTokens.length} expo=${expoTokens.length} firebase=${firebaseTokens.length}`,
      );

      let successCount = 0;
      let failureCount = 0;

      // Send via Expo Push Service
      if (expoTokens.length > 0) {
        const expoResult = await this.pushService.sendViaExpo(expoTokens, notification);
        successCount += expoResult.successCount;
        failureCount += expoResult.failureCount;
      }

      // Send via Firebase (if configured and has Firebase tokens)
      if (firebaseTokens.length > 0 && firebaseApp) {
        const firebaseResult = await this.pushService.sendViaFirebase(firebaseTokens, notification);
        successCount += firebaseResult.successCount;
        failureCount += firebaseResult.failureCount;
      } else if (firebaseTokens.length > 0 && !firebaseApp) {
        this.logger.warn(
          `⚠️ Firebase tokens present for user=${userId} but Firebase Admin is not initialized (missing env vars).`,
        );
      }

      this.logger.log(
        `✅ Sent notification to user ${userId}: ${successCount}/${allTokens.length} successful`,
      );

      // Save to notification history
      await this.historyService.saveNotification(userId, notification);

      return {
        success: successCount > 0,
        successCount,
        failureCount,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send notification: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Send push notification to a tenant (uses tenant_fcm_tokens table)
   */
  async sendToTenant(tenantId: number, notification: SendNotificationDto) {
    try {
      this.logger.log(`📤 sendToTenant tenant=${tenantId} title=${notification.title}`);

      const tokens = await this.prisma.tenant_fcm_tokens.findMany({
        where: { tenant_id: tenantId, is_active: true },
        select: { fcm_token: true },
      });

      if (tokens.length === 0) {
        this.logger.warn(`⚠️ No tokens found for tenant ${tenantId}`);
        return { success: false, message: 'No tokens found' };
      }

      const allTokens = tokens.map((t) => t.fcm_token).filter((t) => t.length > 0);
      const expoTokens = allTokens.filter((t) => Expo.isExpoPushToken(t));
      const firebaseTokens = allTokens.filter((t) => !Expo.isExpoPushToken(t));

      let successCount = 0;
      let failureCount = 0;

      if (expoTokens.length > 0) {
        const result = await this.pushService.sendViaExpo(expoTokens, notification);
        successCount += result.successCount;
        failureCount += result.failureCount;
      }

      if (firebaseTokens.length > 0 && firebaseApp) {
        const result = await this.pushService.sendViaFirebase(firebaseTokens, notification);
        successCount += result.successCount;
        failureCount += result.failureCount;
      }

      this.logger.log(`✅ sendToTenant tenant=${tenantId}: ${successCount}/${allTokens.length} successful`);
      return { success: successCount > 0, successCount, failureCount };
    } catch (error) {
      this.logger.error(`❌ sendToTenant tenant=${tenantId} err=${getErrorMessage(error)}`);
      return { success: false, message: getErrorMessage(error) };
    }
  }

  /**
   * Send notification to multiple users
   */
  async sendToMultipleUsers(userIds: number[], notification: SendNotificationDto) {
    const results = [];

    for (const userId of userIds) {
      try {
        const result = await this.sendToUser(userId, notification);
        results.push({ userId, ...result });
      } catch (error) {
        results.push({ userId, success: false, error: getErrorMessage(error) });
      }
    }

    return results;
  }

  /**
   * Send notification to all admins (SUPER_ADMIN + ADMIN) of an organization.
   * Optionally filter by pg_id — only sends to admins who have access to that PG.
   * If pg_id is provided but no PG-specific admins found, falls back to all org admins.
   */
  async sendToOrgAdmins(organizationId: number, notification: SendNotificationDto, pgId?: number) {
    try {
      // Find SUPER_ADMIN and ADMIN role IDs
      const adminRoles = await this.prisma.roles.findMany({
        where: {
          role_name: { in: ['SUPER_ADMIN', 'ADMIN', 'super_admin', 'admin'] },
          is_deleted: false,
        },
        select: { s_no: true, role_name: true },
      });

      if (adminRoles.length === 0) {
        this.logger.warn(`⚠️ No admin roles found for notification`);
        return { success: false, message: 'No admin roles found' };
      }

      const adminRoleIds = adminRoles.map((r) => r.s_no);

      // Find all users with admin roles in this organization
      const admins = await this.prisma.users.findMany({
        where: {
          organization_id: organizationId,
          role_id: { in: adminRoleIds },
          is_deleted: false,
          status: 'ACTIVE',
        },
        select: { s_no: true, name: true, roles: { select: { role_name: true } } },
      });

      if (admins.length === 0) {
        this.logger.warn(`⚠️ No active admins found in org ${organizationId}`);
        return { success: false, message: 'No active admins found' };
      }

      const adminUserIds = admins.map((a) => a.s_no);
      this.logger.log(
        `📤 sendToOrgAdmins org=${organizationId} pg=${pgId ?? 'all'} admins=${adminUserIds.length} title=${notification.title}`,
      );

      return await this.sendToMultipleUsers(adminUserIds, notification);
    } catch (error) {
      this.logger.error(`❌ sendToOrgAdmins org=${organizationId} err=${getErrorMessage(error)}`);
      return { success: false, message: getErrorMessage(error) };
    }
  }
}
