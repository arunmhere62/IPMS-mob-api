import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

// Initialize Firebase Admin SDK
let firebaseApp: admin.app.App;

try {
  // Check if already initialized
  if (!admin.apps.length) {
    // Use environment variables for Firebase credentials
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (!projectId || !privateKey || !clientEmail) {
      throw new Error('Missing Firebase environment variables');
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKey,
        clientEmail,
      }),
    });
    
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    firebaseApp = admin.app();
  }
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
  console.log('⚠️ Notifications will not work without Firebase environment variables');
  console.log('⚠️ Required: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
}

export interface SendNotificationDto {
  title: string;
  body: string;
  type: string;
  data?: any;
}

export interface RegisterTokenDto {
  fcm_token: string;
  device_type?: string;
  device_id?: string;
  device_name?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private expo: Expo;

  constructor(private prisma: PrismaService) {
    // Initialize Expo SDK
    this.expo = new Expo(
      process.env.EXPO_ACCESS_TOKEN
        ? {
            accessToken: '7JjKhDZFGCyQ87HPb5TPfwbvv2zKL11F4ndEd7SV',
          }
        : { accessToken: '7JjKhDZFGCyQ87HPb5TPfwbvv2zKL11F4ndEd7SV' },
    );
  }

  async sendToExpoToken(token: string, notification: SendNotificationDto) {
    if (!Expo.isExpoPushToken(token)) {
      return { success: false, message: 'Invalid Expo push token' };
    }

    const result = await this.sendViaExpo([token], notification);
    return {
      success: result.successCount > 0,
      ...result,
    };
  }

  /**
   * Register FCM token for a user
   */
  async registerToken(userId: number, tokenData: RegisterTokenDto) {
    try {
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
        
        this.logger.log(`✅ Updated FCM token for user ${userId}`);
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

      this.logger.log(`✅ Registered new FCM token for user ${userId}`);
      return { success: true, message: 'Token registered' };
    } catch (error) {
      this.logger.error(`❌ Failed to register token: ${error.message}`);
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
      this.logger.error(`❌ Failed to unregister token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send notification to specific user (supports both Firebase and Expo tokens)
   */
  async sendToUser(userId: number, notification: SendNotificationDto) {
    try {
      // Get user's active tokens
      const tokens = await this.prisma.user_fcm_tokens.findMany({
        where: {
          user_id: userId,
          is_active: true,
        },
        select: {
          fcm_token: true,
        },
      });

      if (tokens.length === 0) {
        this.logger.warn(`⚠️ No tokens found for user ${userId}`);
        return { success: false, message: 'No tokens found' };
      }

      const allTokens = tokens.map(t => t.fcm_token);
      
      // Separate Expo tokens from Firebase tokens
      const expoTokens = allTokens.filter(token => Expo.isExpoPushToken(token));
      const firebaseTokens = allTokens.filter(token => !Expo.isExpoPushToken(token));

      let successCount = 0;
      let failureCount = 0;

      // Send via Expo Push Service
      if (expoTokens.length > 0) {
        const expoResult = await this.sendViaExpo(expoTokens, notification);
        successCount += expoResult.successCount;
        failureCount += expoResult.failureCount;
      }

      // Send via Firebase (if configured and has Firebase tokens)
      if (firebaseTokens.length > 0 && firebaseApp) {
        const firebaseResult = await this.sendViaFirebase(firebaseTokens, notification);
        successCount += firebaseResult.successCount;
        failureCount += firebaseResult.failureCount;
      }

      this.logger.log(
        `✅ Sent notification to user ${userId}: ${successCount}/${allTokens.length} successful`,
      );

      // Save to notification history
      await this.saveNotification(userId, notification);

      return {
        success: successCount > 0,
        successCount,
        failureCount,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to send notification: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send via Expo Push Service
   */
  private async sendViaExpo(tokens: string[], notification: SendNotificationDto) {
    try {
      const messages: ExpoPushMessage[] = tokens.map(token => ({
        to: token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: {
          type: notification.type,
          ...(notification.data || {}),
        },
      }));

      const chunks = this.expo.chunkPushNotifications(messages);
      let successCount = 0;
      let failureCount = 0;

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          
          ticketChunk.forEach((ticket, index) => {
            if (ticket.status === 'ok') {
              successCount++;
            } else {
              failureCount++;
              this.logger.warn(`❌ Expo push failed: ${ticket.message}`);
              
              // Mark token as inactive if error is token-related
              if (ticket.details?.error === 'DeviceNotRegistered') {
                this.markTokenInactive(tokens[index]);
              }
            }
          });
        } catch (error) {
          this.logger.error(`❌ Expo chunk send failed: ${error.message}`);
          failureCount += chunk.length;
        }
      }

      return { successCount, failureCount };
    } catch (error) {
      this.logger.error(`❌ Expo send failed: ${error.message}`);
      return { successCount: 0, failureCount: tokens.length };
    }
  }

  /**
   * Send via Firebase Cloud Messaging
   */
  private async sendViaFirebase(tokens: string[], notification: SendNotificationDto) {
    try {
      const message: admin.messaging.MulticastMessage = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          type: notification.type,
          ...(notification.data || {}),
        },
        tokens: tokens,
      };

      const response = await admin.messaging().sendMulticast(message);

      // Handle failed tokens
      if (response.failureCount > 0) {
        await this.handleFailedTokens(response, tokens);
      }

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      this.logger.error(`❌ Firebase send failed: ${error.message}`);
      return { successCount: 0, failureCount: tokens.length };
    }
  }

  /**
   * Mark token as inactive
   */
  private async markTokenInactive(token: string) {
    try {
      await this.prisma.user_fcm_tokens.update({
        where: { fcm_token: token },
        data: { is_active: false },
      });
    } catch (error) {
      this.logger.error(`Failed to mark token inactive: ${error.message}`);
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
        results.push({ userId, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Save notification to history
   */
  private async saveNotification(userId: number, notification: SendNotificationDto) {
    try {
      await this.prisma.notifications.create({
        data: {
          user_id: userId,
          title: notification.title,
          body: notification.body,
          type: notification.type,
          data: notification.data || null,
          is_read: false,
        },
      });
    } catch (error) {
      this.logger.error(`❌ Failed to save notification: ${error.message}`);
    }
  }

  /**
   * Handle failed tokens (mark as inactive)
   */
  private async handleFailedTokens(
    response: admin.messaging.BatchResponse,
    tokens: string[],
  ) {
    const failedTokens: string[] = [];

    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        failedTokens.push(tokens[idx]);
      }
    });

    if (failedTokens.length > 0) {
      await this.prisma.user_fcm_tokens.updateMany({
        where: {
          fcm_token: { in: failedTokens },
        },
        data: {
          is_active: false,
          updated_at: new Date(),
        },
      });

      this.logger.log(`🗑️ Marked ${failedTokens.length} failed tokens as inactive`);
    }
  }

  /**
   * Get notification history for user
   */
  async getHistory(userId: number, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;

      const [notifications, total] = await Promise.all([
        this.prisma.notifications.findMany({
          where: { user_id: userId },
          orderBy: { sent_at: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.notifications.count({
          where: { user_id: userId },
        }),
      ]);

      return {
        notifications,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      this.logger.error(`❌ Failed to get notification history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: number) {
    try {
      const count = await this.prisma.notifications.count({
        where: {
          user_id: userId,
          is_read: false,
        },
      });

      return { count };
    } catch (error) {
      this.logger.error(`❌ Failed to get unread count: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: number, userId: number) {
    try {
      await this.prisma.notifications.updateMany({
        where: {
          s_no: notificationId,
          user_id: userId,
        },
        data: {
          is_read: true,
          read_at: new Date(),
        },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Failed to mark as read: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: number) {
    try {
      await this.prisma.notifications.updateMany({
        where: {
          user_id: userId,
          is_read: false,
        },
        data: {
          is_read: true,
          read_at: new Date(),
        },
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`❌ Failed to mark all as read: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send rent payment reminders (called by cron)
   */
  async sendRentReminders() {
    try {
      // Get tenants with upcoming payments (due in 3 days)
      const upcomingPayments: any[] = await this.prisma.$queryRaw`
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
          await this.sendToUser(payment.user_id, {
            title: '💰 Rent Payment Reminder',
            body: `Hi ${payment.tenant_name}, your rent of ₹${payment.pending_amount} is due in 3 days`,
            type: 'RENT_REMINDER',
            data: {
              tenant_id: payment.tenant_id,
              amount: payment.pending_amount,
              due_date: payment.due_date,
            },
          });
        }
      }

      return { sent: upcomingPayments.length };
    } catch (error) {
      this.logger.error(`❌ Failed to send rent reminders: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send overdue payment alerts (called by cron)
   */
  async sendOverdueAlerts() {
    try {
      // Get tenants with overdue payments
      const overduePayments: any[] = await this.prisma.$queryRaw`
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
          await this.sendToUser(payment.user_id, {
            title: '⚠️ Overdue Payment Alert',
            body: `Your rent payment of ₹${payment.overdue_amount} is ${payment.overdue_days} days overdue`,
            type: 'OVERDUE_ALERT',
            data: {
              tenant_id: payment.tenant_id,
              amount: payment.overdue_amount,
              overdue_days: payment.overdue_days,
              overdue_months: payment.overdue_months,
            },
          });
        }
      }

      return { sent: overduePayments.length };
    } catch (error) {
      this.logger.error(`❌ Failed to send overdue alerts: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmation(userId: number, paymentData: any) {
    return await this.sendToUser(userId, {
      title: '✅ Payment Received',
      body: `Payment of ₹${paymentData.amount} received successfully`,
      type: 'PAYMENT_CONFIRMATION',
      data: paymentData,
    });
  }

  /**
   * Send tenant check-in notification to admin
   */
  async sendTenantCheckinAlert(adminUserId: number, tenantData: any) {
    return await this.sendToUser(adminUserId, {
      title: '🏠 New Tenant Check-in',
      body: `${tenantData.name} checked into Room ${tenantData.room_no}`,
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
      const pendingPayments: any[] = await this.prisma.$queryRaw`
        SELECT 
          t.s_no as tenant_id,
          t.user_id,
          t.name as tenant_name,
          tp.s_no as payment_id,
          tp.amount,
          tp.due_date,
          tp.payment_status
        FROM tenants t
        INNER JOIN tenant_payments tp ON t.s_no = tp.tenant_id
        WHERE tp.payment_status = 'PENDING'
          AND t.status = 'ACTIVE'
          AND t.user_id IS NOT NULL
      `;

      this.logger.log(`📋 Found ${pendingPayments.length} pending payments`);

      let sent = 0;
      for (const payment of pendingPayments) {
        try {
          await this.sendPendingPaymentReminder(payment.user_id, {
            tenant_name: payment.tenant_name,
            amount: payment.amount,
            due_date: payment.due_date,
            tenant_id: payment.tenant_id,
          });
          sent++;
        } catch (error) {
          this.logger.error(`Failed to send notification to user ${payment.user_id}`);
        }
      }

      return { total: pendingPayments.length, sent };
    } catch (error) {
      this.logger.error(`❌ Failed to send pending payment notifications: ${error.message}`);
      throw error;
    }
  }

  /**
   * Automated: Send notifications for payments due in 3 days
   */
  async sendPaymentDueSoonNotifications() {
    try {
      const dueSoonPayments: any[] = await this.prisma.$queryRaw`
        SELECT 
          t.s_no as tenant_id,
          t.user_id,
          t.name as tenant_name,
          tp.amount,
          tp.due_date,
          DATEDIFF(tp.due_date, CURRENT_DATE) as days_remaining
        FROM tenants t
        INNER JOIN tenant_payments tp ON t.s_no = tp.tenant_id
        WHERE tp.payment_status = 'PENDING'
          AND DATEDIFF(tp.due_date, CURRENT_DATE) = 3
          AND t.status = 'ACTIVE'
          AND t.user_id IS NOT NULL
      `;

      this.logger.log(`📅 Found ${dueSoonPayments.length} payments due in 3 days`);

      let sent = 0;
      for (const payment of dueSoonPayments) {
        try {
          await this.sendPaymentDueSoonAlert(payment.user_id, {
            tenant_name: payment.tenant_name,
            amount: payment.amount,
            due_date: payment.due_date,
            tenant_id: payment.tenant_id,
            days_remaining: payment.days_remaining,
          });
          sent++;
        } catch (error) {
          this.logger.error(`Failed to send notification to user ${payment.user_id}`);
        }
      }

      return { total: dueSoonPayments.length, sent };
    } catch (error) {
      this.logger.error(`❌ Failed to send due soon notifications: ${error.message}`);
      throw error;
    }
  }

  /**
   * Automated: Send notifications for overdue payments
   */
  async sendOverduePaymentNotifications() {
    try {
      const overduePayments: any[] = await this.prisma.$queryRaw`
        SELECT 
          t.s_no as tenant_id,
          t.user_id,
          t.name as tenant_name,
          tp.amount,
          DATEDIFF(CURRENT_DATE, tp.due_date) as overdue_days
        FROM tenants t
        INNER JOIN tenant_payments tp ON t.s_no = tp.tenant_id
        WHERE tp.payment_status = 'PENDING'
          AND tp.due_date < CURRENT_DATE
          AND t.status = 'ACTIVE'
          AND t.user_id IS NOT NULL
      `;

      this.logger.log(`⚠️ Found ${overduePayments.length} overdue payments`);

      let sent = 0;
      for (const payment of overduePayments) {
        try {
          await this.sendOverduePaymentAlert(payment.user_id, {
            tenant_name: payment.tenant_name,
            amount: payment.amount,
            overdue_days: payment.overdue_days,
            tenant_id: payment.tenant_id,
          });
          sent++;
        } catch (error) {
          this.logger.error(`Failed to send notification to user ${payment.user_id}`);
        }
      }

      return { total: overduePayments.length, sent };
    } catch (error) {
      this.logger.error(`❌ Failed to send overdue notifications: ${error.message}`);
      throw error;
    }
  }
}
