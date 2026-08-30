import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getErrorMessage } from './utils/error.util';
import { PushNotificationService } from './services/push-notification.service';
import { NotificationHistoryService } from './services/notification-history.service';
import { NotificationTemplateService } from './services/notification-template.service';
import { NotificationDispatcherService } from './services/notification-dispatcher.service';
import { SendNotificationDto, RegisterTokenDto } from './types/notification.types';

// Re-export DTOs for backward compatibility
export { SendNotificationDto, RegisterTokenDto };

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private readonly pushService: PushNotificationService,
    private readonly historyService: NotificationHistoryService,
    private readonly templateService: NotificationTemplateService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  async sendToExpoToken(token: string, notification: SendNotificationDto) {
    return this.dispatcher.sendToExpoToken(token, notification);
  }



  /**
   * Register FCM token for a user
   */
  async registerToken(userId: number, tokenData: RegisterTokenDto) {
    try {
      this.logger.log(
        `📌 registerToken user=${userId} token=${this.pushService.maskToken(tokenData.fcm_token)} device_type=${tokenData.device_type ?? 'unknown'} device_id=${tokenData.device_id ?? ''}`,
      );

      // Check if token already exists
      const existing = await this.prisma.user_fcm_tokens.findUnique({
        where: { fcm_token: tokenData.fcm_token },
      });

      if (existing) {
        // Update existing token
        await this.prisma.user_fcm_tokens.update({
          where: { fcm_token: tokenData.fcm_token },
          data: {
            user_id: userId,
            is_active: true,
            updated_at: new Date(),
          },
        });

        if (tokenData.device_id) {
          await this.pushService.deactivateOtherTokensForDevice({
            userId,
            deviceId: tokenData.device_id,
            keepToken: tokenData.fcm_token,
          });
        }
        
        this.logger.log(`✅ Updated token for user ${userId} token=${this.pushService.maskToken(tokenData.fcm_token)}`);
        return { success: true, message: 'Token updated' };
      }

      // Create new token
      await this.prisma.user_fcm_tokens.create({
        data: {
          user_id: userId,
          fcm_token: tokenData.fcm_token,
          device_type: tokenData.device_type || 'unknown',
          device_id: tokenData.device_id,
          device_name: tokenData.device_name,
          is_active: true,
        },
      });

      if (tokenData.device_id) {
        await this.pushService.deactivateOtherTokensForDevice({
          userId,
          deviceId: tokenData.device_id,
          keepToken: tokenData.fcm_token,
        });
      }

      // Deactivate this token from tenant_fcm_tokens if it exists (same device, different role)
      await this.prisma.tenant_fcm_tokens.updateMany({
        where: { fcm_token: tokenData.fcm_token },
        data: { is_active: false, updated_at: new Date() },
      });

      this.logger.log(`✅ Registered token for user ${userId} token=${this.pushService.maskToken(tokenData.fcm_token)}`);
      return { success: true, message: 'Token registered' };
    } catch (error) {
      this.logger.error(
        `❌ Failed to register token user=${userId} token=${this.pushService.maskToken(tokenData?.fcm_token)} err=${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  /**
   * Unregister FCM token
   */
  async unregisterToken(fcmToken: string) {
    try {
      await this.prisma.user_fcm_tokens.update({
        where: { fcm_token: fcmToken },
        data: {
          is_active: false,
          updated_at: new Date(),
        },
      });

      this.logger.log(`✅ Unregistered FCM token`);
      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Failed to unregister token: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Send notification to specific user (supports both Firebase and Expo tokens)
   */
  async sendToUser(userId: number, notification: SendNotificationDto) {
    return this.dispatcher.sendToUser(userId, notification);
  }

  /**
   * Register FCM token for a tenant
   */
  async registerTenantToken(tenantId: number, tokenData: RegisterTokenDto) {
    try {
      const existing = await this.prisma.tenant_fcm_tokens.findUnique({
        where: { fcm_token: tokenData.fcm_token },
      });

      if (existing) {
        await this.prisma.tenant_fcm_tokens.update({
          where: { fcm_token: tokenData.fcm_token },
          data: {
            tenant_id: tenantId,
            device_type: tokenData.device_type,
            device_id: tokenData.device_id,
            device_name: tokenData.device_name,
            is_active: true,
            updated_at: new Date(),
          },
        });
      } else {
        await this.prisma.tenant_fcm_tokens.create({
          data: {
            tenant_id: tenantId,
            fcm_token: tokenData.fcm_token,
            device_type: tokenData.device_type,
            device_id: tokenData.device_id,
            device_name: tokenData.device_name,
            is_active: true,
          },
        });
      }

      // Deactivate this token from user_fcm_tokens if it exists (same device, different role)
      await this.prisma.user_fcm_tokens.updateMany({
        where: { fcm_token: tokenData.fcm_token },
        data: { is_active: false, updated_at: new Date() },
      });

      return { success: true, message: 'Tenant token registered' };
    } catch (error) {
      this.logger.error(`❌ registerTenantToken tenant=${tenantId} err=${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Unregister FCM token for a tenant
   */
  async unregisterTenantToken(fcmToken: string) {
    try {
      await this.prisma.tenant_fcm_tokens.update({
        where: { fcm_token: fcmToken },
        data: { is_active: false, updated_at: new Date() },
      });
      return { success: true, message: 'Tenant token unregistered' };
    } catch {
      return { success: false, message: 'Token not found' };
    }
  }

  /**
   * Send push notification to a tenant (uses tenant_fcm_tokens table)
   */
  async sendToTenant(tenantId: number, notification: SendNotificationDto) {
    return this.dispatcher.sendToTenant(tenantId, notification);
  }

  /**
   * Send notification to multiple users
   */
  async sendToMultipleUsers(userIds: number[], notification: SendNotificationDto) {
    return this.dispatcher.sendToMultipleUsers(userIds, notification);
  }

  /**
   * Send notification to all admins (SUPER_ADMIN + ADMIN) of an organization.
   * Optionally filter by pg_id — only sends to admins who have access to that PG.
   * If pg_id is provided but no PG-specific admins found, falls back to all org admins.
   */
  async sendToOrgAdmins(organizationId: number, notification: SendNotificationDto, pgId?: number) {
    return this.dispatcher.sendToOrgAdmins(organizationId, notification, pgId);
  }

  /**
   * Get notification history for user
   */
  async getHistory(userId: number, page = 1, limit = 20) {
    return this.historyService.getHistory(userId, page, limit);
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: number) {
    return this.historyService.getUnreadCount(userId);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: number, userId: number) {
    return this.historyService.markAsRead(notificationId, userId);
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: number) {
    return this.historyService.markAllAsRead(userId);
  }

  /**
   * Send rent payment reminders (called by cron)
   */
  async sendRentReminders() {
    return this.templateService.sendRentReminders();
  }

  /**
   * Send overdue payment alerts (called by cron)
   */
  async sendOverdueAlerts() {
    return this.templateService.sendOverdueAlerts();
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmation(userId: number, paymentData: Record<string, unknown>) {
    return this.templateService.sendPaymentConfirmation(userId, paymentData);
  }

  /**
   * Send tenant check-in notification to admin
   */
  async sendTenantCheckinAlert(adminUserId: number, tenantData: Record<string, unknown>) {
    return this.templateService.sendTenantCheckinAlert(adminUserId, tenantData);
  }

  /**
   * Send pending payment reminder to tenant
   */
  async sendPendingPaymentReminder(userId: number, paymentData: {
    tenant_name: string;
    amount: number;
    due_date: string;
    tenant_id: number;
  }) {
    return this.templateService.sendPendingPaymentReminder(userId, paymentData);
  }

  /**
   * Send partial payment received notification
   */
  async sendPartialPaymentNotification(userId: number, paymentData: {
    tenant_name: string;
    paid_amount: number;
    remaining_amount: number;
    tenant_id: number;
    payment_id: number;
  }) {
    return this.templateService.sendPartialPaymentNotification(userId, paymentData);
  }

  /**
   * Send full payment confirmation
   */
  async sendFullPaymentConfirmation(userId: number, paymentData: {
    tenant_name: string;
    amount: number;
    tenant_id: number;
    payment_id: number;
  }) {
    return this.templateService.sendFullPaymentConfirmation(userId, paymentData);
  }

  /**
   * Send payment due soon alert (3 days before)
   */
  async sendPaymentDueSoonAlert(userId: number, paymentData: {
    tenant_name: string;
    amount: number;
    due_date: string;
    tenant_id: number;
    days_remaining: number;
  }) {
    return this.templateService.sendPaymentDueSoonAlert(userId, paymentData);
  }

  /**
   * Send overdue payment alert
   */
  async sendOverduePaymentAlert(userId: number, paymentData: {
    tenant_name: string;
    amount: number;
    overdue_days: number;
    tenant_id: number;
  }) {
    return this.templateService.sendOverduePaymentAlert(userId, paymentData);
  }

  /**
   * Automated: Send notifications for all pending payments
   */
  async sendPendingPaymentNotifications() {
    return this.templateService.sendPendingPaymentNotifications();
  }

  /**
   * Automated: Send notifications for payments due in 3 days
   */
  async sendPaymentDueSoonNotifications() {
    return this.templateService.sendPaymentDueSoonNotifications();
  }

  /**
   * Automated: Send notifications for overdue payments
   */
  async sendOverduePaymentNotifications() {
    return this.templateService.sendOverduePaymentNotifications();
  }

  /**
   * Send static test notification to existing registered devices
   * Used for testing Firebase setup without requiring user authentication
   */
  async sendStaticTestNotification(notification: SendNotificationDto) {
    return this.templateService.sendStaticTestNotification(notification);
  }
}
