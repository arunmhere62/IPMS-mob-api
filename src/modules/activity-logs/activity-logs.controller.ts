import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ActivityLogsService } from './activity-logs.service';
import { LogActivityDto } from './dto/log-activity.dto';
import { QueryActivityDto } from './dto/query-activity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('activity-logs')
@Controller('activity')
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Post('log')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a single activity event (public, for install/update events)' })
  @ApiResponse({ status: 200, description: 'Activity logged successfully' })
  async logActivity(@Body() dto: LogActivityDto, @Req() req: Request) {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;
    const userAgent = req.headers['user-agent'] as string;
    dto.ip_address = dto.ip_address ?? ipAddress;
    dto.user_agent = dto.user_agent ?? userAgent;
    return this.activityLogsService.logActivity(dto);
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Record multiple activity events (batch, auth required)' })
  @ApiResponse({ status: 200, description: 'Activities logged successfully' })
  async logBatch(@Body() dtos: LogActivityDto[], @Req() req: Request) {
    const ipAddress = (req.headers['x-forwarded-for'] as string) || req.ip;
    const userAgent = req.headers['user-agent'] as string;
    dtos.forEach((dto) => {
      dto.ip_address = dto.ip_address ?? ipAddress;
      dto.user_agent = dto.user_agent ?? userAgent;
    });
    return this.activityLogsService.logBatch(dtos);
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Query activity logs (admin only)' })
  @ApiResponse({ status: 200, description: 'Activity logs retrieved successfully' })
  async getLogs(@Query() query: QueryActivityDto) {
    return this.activityLogsService.getLogs(query);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get aggregated activity stats (admin only)' })
  @ApiResponse({ status: 200, description: 'Activity stats retrieved successfully' })
  async getStats(@Query() query: QueryActivityDto) {
    return this.activityLogsService.getStats(query);
  }
}
