import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { getErrorMessage } from '../utils/error.util';
import { SendNotificationDto } from '../types/notification.types';

@Injectable()
export class NotificationHistoryService {
  private readonly logger = new Logger(NotificationHistoryService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Save notification to history
   */
  async saveNotification(userId: number, notification: SendNotificationDto) {
    try {
      await this.prisma.notifications.create({
        data: {
          user_id: userId,
          title: notification.title,
          body: notification.body,
          type: notification.type,
          data: (notification.data ?? null) as unknown as Prisma.InputJsonValue | null,
          is_read: false,
        },
      });
    } catch (error) {
      this.logger.error(`❌ Failed to save notification: ${getErrorMessage(error)}`);
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
      this.logger.error(`❌ Failed to get notification history: ${getErrorMessage(error)}`);
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
      this.logger.error(`❌ Failed to get unread count: ${getErrorMessage(error)}`);
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
      this.logger.error(`❌ Failed to mark as read: ${getErrorMessage(error)}`);
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
      this.logger.error(`❌ Failed to mark all as read: ${getErrorMessage(error)}`);
      throw error;
    }
  }
}
