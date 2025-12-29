import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationService, RegisterTokenDto, SendNotificationDto } from './notification.service';
import { HeadersValidationGuard } from '../../common/guards/headers-validation.guard';
import { RequireHeaders } from '../../common/decorators/require-headers.decorator';
import { ValidatedHeaders, type ValidatedHeaders as ValidatedHeadersType } from '../../common/decorators/validated-headers.decorator';

@Controller('notifications')
@UseGuards(HeadersValidationGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Register FCM token
   * POST /notifications/register-token
   */
  @Post('register-token')
  @RequireHeaders({ user_id: true })
  async registerToken(
    @ValidatedHeaders() headers: ValidatedHeadersType,
    @Body() body: RegisterTokenDto,
  ) {
    const userId = headers.user_id as number;
    return await this.notificationService.registerToken(userId, body);
  }

  /**
   * Unregister FCM token
   * DELETE /notifications/unregister-token
   */
  @Delete('unregister-token')
  async unregisterToken(@Body() body: { fcm_token: string }) {
    return await this.notificationService.unregisterToken(body.fcm_token);
  }

  /**
   * Get notification history
   * GET /notifications/history?page=1&limit=20
   */
  @Get('history')
  @RequireHeaders({ user_id: true })
  async getHistory(
    @ValidatedHeaders() headers: ValidatedHeadersType,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = headers.user_id as number;
    const pageNum = page ? parseInt(page) : 1;
    const limitNum = limit ? parseInt(limit) : 20;
    
    return await this.notificationService.getHistory(userId, pageNum, limitNum);
  }

  /**
   * Get unread notification count
   * GET /notifications/unread-count
   */
  @Get('unread-count')
  @RequireHeaders({ user_id: true })
  async getUnreadCount(@ValidatedHeaders() headers: ValidatedHeadersType) {
    const userId = headers.user_id as number;
    return await this.notificationService.getUnreadCount(userId);
  }

  /**
   * Mark notification as read
   * PUT /notifications/:id/read
   */
  @Put(':id/read')
  @RequireHeaders({ user_id: true })
  async markAsRead(
    @ValidatedHeaders() headers: ValidatedHeadersType,
    @Param('id') id: string,
  ) {
    const userId = headers.user_id as number;
    const notificationId = parseInt(id);
    return await this.notificationService.markAsRead(notificationId, userId);
  }

  /**
   * Mark all notifications as read
   * PUT /notifications/read-all
   */
  @Put('read-all')
  @RequireHeaders({ user_id: true })
  async markAllAsRead(@ValidatedHeaders() headers: ValidatedHeadersType) {
    const userId = headers.user_id as number;
    return await this.notificationService.markAllAsRead(userId);
  }

  /**
   * Send test notification (for testing)
   * POST /notifications/test
   */
  @Post('test')
  @RequireHeaders({ user_id: true })
  async sendTestNotification(@ValidatedHeaders() headers: ValidatedHeadersType) {
    const userId = headers.user_id as number;
    
    return await this.notificationService.sendToUser(userId, {
      title: '🎉 Test Notification',
      body: 'This is a test notification from PG Management System',
      type: 'TEST',
      data: {
        test: true,
        timestamp: new Date().toISOString(),
      },
    });
  }

  @Post('test-token')
  @RequireHeaders({ user_id: true })
  async sendTestToToken(
    @Body()
    body: {
      to: string;
      title: string;
      message: string;
      type?: string;
      data?: any;
    },
  ) {
    return await this.notificationService.sendToExpoToken(body.to, {
      title: body.title,
      body: body.message,
      type: body.type || 'TEST',
      data: body.data,
    });
  }

  /**
   * Manually trigger rent reminders (for testing)
   * POST /notifications/trigger-rent-reminders
   */
  @Post('trigger-rent-reminders')
  async triggerRentReminders() {
    return await this.notificationService.sendRentReminders();
  }

  /**
   * Manually trigger overdue alerts (for testing)
   * POST /notifications/trigger-overdue-alerts
   */
  @Post('trigger-overdue-alerts')
  async triggerOverdueAlerts() {
    return await this.notificationService.sendOverdueAlerts();
  }

  /**
   * Send pending payment notifications
   * POST /notifications/trigger-pending-payments
   */
  @Post('trigger-pending-payments')
  async triggerPendingPayments() {
    return await this.notificationService.sendPendingPaymentNotifications();
  }

  /**
   * Send payment due soon notifications (3 days before)
   * POST /notifications/trigger-due-soon
   */
  @Post('trigger-due-soon')
  async triggerDueSoon() {
    return await this.notificationService.sendPaymentDueSoonNotifications();
  }

  /**
   * Send overdue payment notifications
   * POST /notifications/trigger-overdue-payments
   */
  @Post('trigger-overdue-payments')
  async triggerOverduePayments() {
    return await this.notificationService.sendOverduePaymentNotifications();
  }
}
