import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseUtil } from '../../common/utils/response.util';
import { DashboardRentNotificationsCronService } from './dashboard-rent-notifications-cron.service';

@ApiTags('Dashboard Rent Notification Cron')
@Controller('dashboard-rent-notification-cron')
@ApiBearerAuth()
export class DashboardRentNotificationsCronController {
  constructor(private readonly cronService: DashboardRentNotificationsCronService) {}

  @Post('trigger-partial')
  @ApiOperation({ summary: 'Manually trigger partial rent summary notifications (for testing)' })
  async triggerPartial() {
    await this.cronService.runPartialRentSummary({ force: true });
    return ResponseUtil.success({ message: 'Partial rent summary cron triggered' }, 'Cron job triggered');
  }

  @Post('trigger-pending')
  @ApiOperation({ summary: 'Manually trigger pending rent summary notifications (for testing)' })
  async triggerPending() {
    await this.cronService.runPendingRentSummary({ force: true });
    return ResponseUtil.success({ message: 'Pending rent summary cron triggered' }, 'Cron job triggered');
  }
}
