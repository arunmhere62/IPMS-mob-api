import { Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseUtil } from '../../common/utils/response.util';
import { RentCycleCronService } from './rent-cycle-cron.service';

@ApiTags('Rent Cycle Cron')
@Controller('rent-cycle-cron')
@ApiBearerAuth()
export class RentCycleCronController {
  constructor(private readonly rentCycleCronService: RentCycleCronService) {}

  @Post('trigger')
  @ApiOperation({ summary: 'Trigger rent cycle creation for all active tenants (testing / backfill)' })
  async triggerAll() {
    const result = await this.rentCycleCronService.triggerAll();
    return ResponseUtil.success(result, 'Rent cycle creation triggered for all PGs');
  }

  @Post('trigger/:pg_id')
  @ApiOperation({ summary: 'Trigger rent cycle creation for a specific PG (testing)' })
  async triggerForPg(@Param('pg_id', ParseIntPipe) pgId: number) {
    const result = await this.rentCycleCronService.triggerForPg(pgId);
    return ResponseUtil.success(result, `Rent cycle creation triggered for PG ${pgId}`);
  }
}
