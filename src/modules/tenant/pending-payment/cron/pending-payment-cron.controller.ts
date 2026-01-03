import { Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseUtil } from '../../../../common/utils/response.util';
import { PendingPaymentCronService } from './pending-payment-cron.service';

@ApiTags('Pending Payment Cron')
@Controller('pending-payment-cron')
// @UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PendingPaymentCronController {
  constructor(private readonly cronService: PendingPaymentCronService) {}

  @Post('trigger-pending-check')
  @ApiOperation({ summary: 'Manually trigger pending rent payment check (for testing)' })
  async triggerPendingCheck() {
    await this.cronService.triggerPendingRentCheck();
    return ResponseUtil.success(
      { message: 'Pending rent check triggered successfully' },
      'Cron job triggered',
    );
  }

  @Post('trigger-pending-check/:userId')
  @ApiOperation({
    summary:
      'Manually trigger pending rent check for a specific user (PG owner) (for testing)',
  })
  async triggerPendingCheckForUser(
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    const result = await this.cronService.triggerPendingRentCheckForUser(userId);
    return ResponseUtil.success(result, 'Cron job triggered');
  }

  @Post('trigger-daily-reminder')
  @ApiOperation({ summary: 'Manually trigger daily payment reminder (for testing)' })
  async triggerDailyReminder() {
    await this.cronService.triggerDailyReminder();
    return ResponseUtil.success(
      { message: 'Daily reminder triggered successfully' },
      'Cron job triggered',
    );
  }
}
