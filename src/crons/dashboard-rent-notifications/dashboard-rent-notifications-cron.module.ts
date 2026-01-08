import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DashboardModule } from '../../modules/dashboard/dashboard.module';
import { NotificationModule } from '../../modules/notification/notification.module';
import { DashboardRentNotificationsCronController } from './dashboard-rent-notifications-cron.controller';
import { DashboardRentNotificationsCronService } from './dashboard-rent-notifications-cron.service';

@Module({
  imports: [PrismaModule, DashboardModule, NotificationModule],
  controllers: [DashboardRentNotificationsCronController],
  providers: [DashboardRentNotificationsCronService],
  exports: [DashboardRentNotificationsCronService],
})
export class DashboardRentNotificationsCronModule {}
