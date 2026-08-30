import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PushNotificationService } from './push-notification.service';
import { NotificationHistoryService } from './notification-history.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { SendNotificationDto } from '../types/notification.types';
import { getErrorMessage } from '../utils/error.util';

@Injectable()
export class NotificationTemplateService {
  private readonly logger = new Logger(NotificationTemplateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushNotificationService,
    private readonly historyService: NotificationHistoryService,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  private async sendToUser(userId: number, notification: SendNotificationDto) {
    return this.dispatcher.sendToUser(userId, notification);
  }

  /**
   * Send rent payment reminders (called by cron)
   */
  async sendRentReminders() {
    try {
      // Get tenants with upcoming payments (due in 3 days)
      const upcomingPayments: Array<{ tenant_id: number; user_id: number | null; tenant_name: string; pending_amount: unknown; due_date: unknown }> = await this.prisma.$queryRaw`
        SELECT 
          t.s_no as tenant_id,
          t.user_id,
          t.name as tenant_name,
          pp.total_pending as pending_amount,
          pp.next_due_date as due_date
        FROM tenants t
        INNER JOIN pending_payments pp ON t.s_no = pp.tenant_id
        WHERE pp.next_due_date::date = CURRENT_DATE + INTERVAL '3 days'
          AND pp.total_pending > 0
          AND t.status = 'ACTIVE'
      `;

      this.logger.log(`📅 Found ${upcomingPayments.length} tenants with upcoming payments`);

      for (const payment of upcomingPayments) {
        if (payment.user_id) {
          await this.sendToUser(Number(payment.user_id), {
            title: '💰 Rent Payment Reminder',
            body: `Hi ${payment.tenant_name}, your rent of ₹${Number(payment.pending_amount || 0)} is due in 3 days`,
            type: 'RENT_REMINDER',
            data: {
              tenant_id: payment.tenant_id,
              amount: Number(payment.pending_amount || 0),
              due_date: payment.due_date,
            },
          });
        }
      }

      return { sent: upcomingPayments.length };
    } catch (error) {
      this.logger.error(`❌ Failed to send rent reminders: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Send overdue payment alerts (called by cron)
   */
  async sendOverdueAlerts() {
    try {
      // Get tenants with overdue payments
      const overduePayments: Array<{ tenant_id: number; user_id: number | null; tenant_name: string; overdue_amount: unknown; overdue_months: unknown; overdue_days: unknown }> = await this.prisma.$queryRaw`
        SELECT 
          t.s_no as tenant_id,
          t.user_id,
          t.name as tenant_name,
          pp.total_pending as overdue_amount,
          pp.overdue_months,
          CURRENT_DATE - pp.next_due_date::date as overdue_days
        FROM tenants t
        INNER JOIN pending_payments pp ON t.s_no = pp.tenant_id
        WHERE pp.payment_status = 'OVERDUE'
          AND pp.total_pending > 0
          AND t.status = 'ACTIVE'
      `;

      this.logger.log(`⚠️ Found ${overduePayments.length} tenants with overdue payments`);

      for (const payment of overduePayments) {
        if (payment.user_id) {
          await this.sendToUser(Number(payment.user_id), {
            title: '⚠️ Overdue Payment Alert',
            body: `Your rent payment of ₹${Number(payment.overdue_amount || 0)} is ${Number(payment.overdue_days || 0)} days overdue`,
            type: 'OVERDUE_ALERT',
            data: {
              tenant_id: payment.tenant_id,
              amount: Number(payment.overdue_amount || 0),
              overdue_days: Number(payment.overdue_days || 0),
              overdue_months: Number(payment.overdue_months || 0),
            },
          });
        }
      }

      return { sent: overduePayments.length };
    } catch (error) {
      this.logger.error(`❌ Failed to send overdue alerts: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmation(userId: number, paymentData: Record<string, unknown>) {
    const amount = Number(paymentData.amount || 0);
    return await this.sendToUser(userId, {
      title: '✅ Payment Received',
      body: `Payment of ₹${amount} received successfully`,
      type: 'PAYMENT_CONFIRMATION',
      data: paymentData,
    });
  }

  /**
   * Send tenant check-in notification to admin
   */
  async sendTenantCheckinAlert(adminUserId: number, tenantData: Record<string, unknown>) {
    const name = String(tenantData.name ?? '');
    const roomNo = String(tenantData.room_no ?? '');
    return await this.sendToUser(adminUserId, {
      title: '🏠 New Tenant Check-in',
      body: `${name} checked into Room ${roomNo}`,
      type: 'TENANT_CHECKIN',
      data: tenantData,
    });
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
    return await this.sendToUser(userId, {
      title: '💰 Payment Pending',
      body: `Hi ${paymentData.tenant_name}, you have a pending payment of ₹${paymentData.amount}. Due date: ${new Date(paymentData.due_date).toLocaleDateString()}`,
      type: 'PENDING_PAYMENT',
      data: {
        tenant_id: paymentData.tenant_id,
        amount: paymentData.amount,
        due_date: paymentData.due_date,
      },
    });
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
    return await this.sendToUser(userId, {
      title: '✅ Partial Payment Received',
      body: `Payment of ₹${paymentData.paid_amount} received. Remaining balance: ₹${paymentData.remaining_amount}`,
      type: 'PARTIAL_PAYMENT',
      data: {
        tenant_id: paymentData.tenant_id,
        payment_id: paymentData.payment_id,
        paid_amount: paymentData.paid_amount,
        remaining_amount: paymentData.remaining_amount,
      },
    });
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
    return await this.sendToUser(userId, {
      title: '🎉 Payment Completed',
      body: `Full payment of ₹${paymentData.amount} received successfully. Thank you!`,
      type: 'FULL_PAYMENT',
      data: {
        tenant_id: paymentData.tenant_id,
        payment_id: paymentData.payment_id,
        amount: paymentData.amount,
      },
    });
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
    return await this.sendToUser(userId, {
      title: '⏰ Payment Due Soon',
      body: `Reminder: Your rent of ₹${paymentData.amount} is due in ${paymentData.days_remaining} days`,
      type: 'PAYMENT_DUE_SOON',
      data: {
        tenant_id: paymentData.tenant_id,
        amount: paymentData.amount,
        due_date: paymentData.due_date,
        days_remaining: paymentData.days_remaining,
      },
    });
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
    return await this.sendToUser(userId, {
      title: '⚠️ Payment Overdue',
      body: `Your payment of ₹${paymentData.amount} is ${paymentData.overdue_days} days overdue. Please pay immediately to avoid penalties.`,
      type: 'PAYMENT_OVERDUE',
      data: {
        tenant_id: paymentData.tenant_id,
        amount: paymentData.amount,
        overdue_days: paymentData.overdue_days,
      },
    });
  }

  /**
   * Automated: Send notifications for all pending payments
   */
  async sendPendingPaymentNotifications() {
    try {
      // Get all tenants with pending payments
      const pendingPayments: Array<{ tenant_id: number; user_id: number; tenant_name: string; payment_id: number; amount: unknown; due_date: unknown; payment_status: string }> = await this.prisma.$queryRaw`
        SELECT 
          t.s_no as tenant_id,
          t.user_id,
          t.name as tenant_name,
          tp.s_no as payment_id,
          tp.amount,
          tp.due_date,
          tp.payment_status
        FROM tenants t
        INNER JOIN rent_payments tp ON t.s_no = tp.tenant_id
        WHERE tp.payment_status = 'PENDING'
          AND t.status = 'ACTIVE'
          AND t.user_id IS NOT NULL
      `;

      this.logger.log(`📋 Found ${pendingPayments.length} pending payments`);

      let sent = 0;
      for (const payment of pendingPayments) {
        try {
          await this.sendPendingPaymentReminder(Number(payment.user_id), {
            tenant_name: payment.tenant_name,
            amount: Number(payment.amount || 0),
            due_date: String(payment.due_date ?? ''),
            tenant_id: payment.tenant_id,
          });
          sent++;
        } catch (error) {
          this.logger.error(`Failed to send notification to user ${payment.user_id}: ${getErrorMessage(error)}`);
        }
      }

      return { total: pendingPayments.length, sent };
    } catch (error) {
      this.logger.error(`❌ Failed to send pending payment notifications: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Automated: Send notifications for payments due in 3 days
   */
  async sendPaymentDueSoonNotifications() {
    try {
      const dueSoonPayments: Array<{ tenant_id: number; user_id: number; tenant_name: string; amount: unknown; due_date: unknown; days_remaining: unknown }> = await this.prisma.$queryRaw`
        SELECT 
          t.s_no as tenant_id,
          t.user_id,
          t.name as tenant_name,
          tp.amount,
          tp.due_date,
          DATEDIFF(tp.due_date, CURRENT_DATE) as days_remaining
        FROM tenants t
        INNER JOIN rent_payments tp ON t.s_no = tp.tenant_id
        WHERE tp.payment_status = 'PENDING'
          AND DATEDIFF(tp.due_date, CURRENT_DATE) = 3
          AND t.status = 'ACTIVE'
          AND t.user_id IS NOT NULL
      `;

      this.logger.log(`📅 Found ${dueSoonPayments.length} payments due in 3 days`);

      let sent = 0;
      for (const payment of dueSoonPayments) {
        try {
          await this.sendPaymentDueSoonAlert(Number(payment.user_id), {
            tenant_name: payment.tenant_name,
            amount: Number(payment.amount || 0),
            due_date: String(payment.due_date ?? ''),
            tenant_id: payment.tenant_id,
            days_remaining: Number(payment.days_remaining || 0),
          });
          sent++;
        } catch (error) {
          this.logger.error(`Failed to send notification to user ${payment.user_id}: ${getErrorMessage(error)}`);
        }
      }

      return { total: dueSoonPayments.length, sent };
    } catch (error) {
      this.logger.error(`❌ Failed to send due soon notifications: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Automated: Send notifications for overdue payments
   */
  async sendOverduePaymentNotifications() {
    try {
      const overduePayments: Array<{ tenant_id: number; user_id: number; tenant_name: string; amount: unknown; overdue_days: unknown }> = await this.prisma.$queryRaw`
        SELECT 
          t.s_no as tenant_id,
          t.user_id,
          t.name as tenant_name,
          tp.amount,
          DATEDIFF(CURRENT_DATE, tp.due_date) as overdue_days
        FROM tenants t
        INNER JOIN rent_payments tp ON t.s_no = tp.tenant_id
        WHERE tp.payment_status = 'PENDING'
          AND tp.due_date < CURRENT_DATE
          AND t.status = 'ACTIVE'
          AND t.user_id IS NOT NULL
      `;

      this.logger.log(`⚠️ Found ${overduePayments.length} overdue payments`);

      let sent = 0;
      for (const payment of overduePayments) {
        try {
          await this.sendOverduePaymentAlert(Number(payment.user_id), {
            tenant_name: payment.tenant_name,
            amount: Number(payment.amount || 0),
            overdue_days: Number(payment.overdue_days || 0),
            tenant_id: payment.tenant_id,
          });
          sent++;
        } catch (error) {
          this.logger.error(`Failed to send notification to user ${payment.user_id}: ${getErrorMessage(error)}`);
        }
      }

      return { total: overduePayments.length, sent };
    } catch (error) {
      this.logger.error(`❌ Failed to send overdue notifications: ${getErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * Send static test notification to existing registered devices
   * Used for testing Firebase setup without requiring user authentication
   */
  async sendStaticTestNotification(notification: SendNotificationDto) {
    try {
      this.logger.log(`[TEST-STATIC] 🧪 Sending static test notification: ${notification.title}`);
      
      // Get all active FCM tokens from database for user 34 (or any active tokens)
      const activeTokens = await this.prisma.user_fcm_tokens.findMany({
        where: {
          is_active: true,
          user_id: 34, // Target user 34 specifically
        },
        select: {
          fcm_token: true,
        },
      });

      // If no tokens for user 34, get any active tokens
      let tokens: string[] = [];
      if (activeTokens.length === 0) {
        this.logger.log(`[TEST-STATIC] No tokens for user 34, checking all active tokens...`);
        const allActiveTokens = await this.prisma.user_fcm_tokens.findMany({
          where: {
            is_active: true,
          },
          select: {
            fcm_token: true,
          },
          take: 1, // Just take the first one for testing
        });
        
        if (allActiveTokens.length === 0) {
          // Fallback: Use a hardcoded token from the screenshot
          const fallbackToken = 'ExponentPushToken[gJX0cDHdNQCPqEi9_HQpZA]'; // From your screenshot
          tokens = [fallbackToken];
          this.logger.log(`[TEST-STATIC] 🔄 Using fallback token for testing: ${this.pushService.maskToken(fallbackToken)}`);
        } else {
          tokens = allActiveTokens.map(t => t.fcm_token);
        }
      } else {
        tokens = activeTokens.map(t => t.fcm_token);
      }

      this.logger.log(`[TEST-STATIC] 📱 Sending to ${tokens.length} token(s)`);

      // Send via Expo Push Service
      const result = await this.pushService.sendViaExpo(tokens, notification);
      
      this.logger.log(`[TEST-STATIC] ✅ Static test notification sent to ${tokens.length} device(s)`);
      
      return {
        ...result,
        totalTokens: tokens.length,
        message: `Static test notification sent to ${result.successCount} device(s)`,
        tokensUsed: tokens.map(t => this.pushService.maskToken(t)),
      };
    } catch (error) {
      this.logger.error(`[TEST-STATIC] ❌ Failed to send static test notification: ${getErrorMessage(error)}`);
      throw error;
    }
  }
}
