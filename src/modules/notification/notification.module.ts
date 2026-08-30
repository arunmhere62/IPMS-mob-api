import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { PushNotificationService, NotificationHistoryService, NotificationTemplateService, NotificationDispatcherService } from './services';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [],
  controllers: [NotificationController],
  providers: [NotificationService, PushNotificationService, NotificationHistoryService, NotificationTemplateService, NotificationDispatcherService, PrismaService],
  exports: [NotificationService, PushNotificationService, NotificationHistoryService, NotificationTemplateService, NotificationDispatcherService],
})
export class NotificationModule {}
