import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LogActivityDto, ActionType } from './dto/log-activity.dto';
import { QueryActivityDto } from './dto/query-activity.dto';
import { ResponseUtil } from '../../common/utils/response.util';
import { Prisma } from '@prisma/client';

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(private prisma: PrismaService) {}

  async logActivity(dto: LogActivityDto) {
    try {
      const record = await this.prisma.user_activity_logs.create({
        data: {
          user_id: dto.user_id ?? null,
          tenant_id: dto.tenant_id ?? null,
          action_type: dto.action_type as ActionType,
          app_version: dto.app_version ?? null,
          os_version: dto.os_version ?? null,
          device_model: dto.device_model ?? null,
          device_id: dto.device_id ?? null,
          ip_address: dto.ip_address ?? null,
          user_agent: dto.user_agent ?? null,
          metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        },
      });

      this.logger.log(
        `Activity logged: ${dto.action_type} user=${dto.user_id ?? '-'} tenant=${dto.tenant_id ?? '-'}`,
      );

      return ResponseUtil.success(record, 'Activity logged successfully');
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to log activity: ${dto.action_type} - ${err.message}`,
        err.stack,
      );
      return ResponseUtil.success(null, 'Activity log failed (non-blocking)');
    }
  }

  async logBatch(dtos: LogActivityDto[]) {
    try {
      const data = dtos.map((dto) => ({
        user_id: dto.user_id ?? null,
        tenant_id: dto.tenant_id ?? null,
        action_type: dto.action_type as ActionType,
        app_version: dto.app_version ?? null,
        os_version: dto.os_version ?? null,
        device_model: dto.device_model ?? null,
        device_id: dto.device_id ?? null,
        ip_address: dto.ip_address ?? null,
        user_agent: dto.user_agent ?? null,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      }));

      const result = await this.prisma.user_activity_logs.createMany({
        data,
      });

      this.logger.log(`Batch logged: ${result.count} activities`);
      return ResponseUtil.success(
        { count: result.count },
        `${result.count} activities logged successfully`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Failed to batch log activities: ${err.message}`,
        err.stack,
      );
      return ResponseUtil.success(null, 'Batch log failed (non-blocking)');
    }
  }

  async getLogs(query: QueryActivityDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.user_id) where.user_id = query.user_id;
    if (query.tenant_id) where.tenant_id = query.tenant_id;
    if (query.action_type) where.action_type = query.action_type;

    if (query.date_from || query.date_to) {
      const createdAtFilter: Record<string, Date> = {};
      if (query.date_from) createdAtFilter.gte = new Date(query.date_from);
      if (query.date_to) createdAtFilter.lte = new Date(query.date_to);
      where.created_at = createdAtFilter;
    }

    const [logs, total] = await Promise.all([
      this.prisma.user_activity_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        include: {
          users: { select: { s_no: true, name: true, phone: true } },
          tenants: { select: { s_no: true, name: true, phone_no: true } },
        },
      }),
      this.prisma.user_activity_logs.count({ where }),
    ]);

    return ResponseUtil.success(
      {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'Activity logs retrieved successfully',
    );
  }

  async getStats(query: QueryActivityDto) {
    const where: Record<string, unknown> = {};

    if (query.user_id) where.user_id = query.user_id;
    if (query.tenant_id) where.tenant_id = query.tenant_id;

    if (query.date_from || query.date_to) {
      const createdAtFilter: Record<string, Date> = {};
      if (query.date_from) createdAtFilter.gte = new Date(query.date_from);
      if (query.date_to) createdAtFilter.lte = new Date(query.date_to);
      where.created_at = createdAtFilter;
    }

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalInstalls,
      totalUpdates,
      loginsToday,
      logins7d,
      logins30d,
      uniqueUsers1d,
      uniqueUsers7d,
      uniqueUsers30d,
      actionTypeCounts,
      topDevices,
    ] = await Promise.all([
      this.prisma.user_activity_logs.count({
        where: { ...where, action_type: 'APP_INSTALL' },
      }),
      this.prisma.user_activity_logs.count({
        where: { ...where, action_type: 'APP_UPDATE' },
      }),
      this.prisma.user_activity_logs.count({
        where: { ...where, action_type: 'LOGIN', created_at: { gte: oneDayAgo } },
      }),
      this.prisma.user_activity_logs.count({
        where: { ...where, action_type: 'LOGIN', created_at: { gte: sevenDaysAgo } },
      }),
      this.prisma.user_activity_logs.count({
        where: { ...where, action_type: 'LOGIN', created_at: { gte: thirtyDaysAgo } },
      }),
      this.prisma.user_activity_logs.findMany({
        where: { ...where, user_id: { not: null }, created_at: { gte: oneDayAgo } },
        distinct: ['user_id'],
        select: { user_id: true },
      }),
      this.prisma.user_activity_logs.findMany({
        where: { ...where, user_id: { not: null }, created_at: { gte: sevenDaysAgo } },
        distinct: ['user_id'],
        select: { user_id: true },
      }),
      this.prisma.user_activity_logs.findMany({
        where: { ...where, user_id: { not: null }, created_at: { gte: thirtyDaysAgo } },
        distinct: ['user_id'],
        select: { user_id: true },
      }),
      this.prisma.user_activity_logs.groupBy({
        by: ['action_type'],
        where,
        _count: { action_type: true },
      }),
      this.prisma.user_activity_logs.groupBy({
        by: ['device_model'],
        where: { ...where, device_model: { not: null } },
        _count: { device_model: true },
        orderBy: { _count: { device_model: 'desc' } },
        take: 10,
      }),
    ]);

    return ResponseUtil.success(
      {
        total_installs: totalInstalls,
        total_updates: totalUpdates,
        login_events_today: loginsToday,
        login_events_7d: logins7d,
        login_events_30d: logins30d,
        active_users_1d: uniqueUsers1d.length,
        active_users_7d: uniqueUsers7d.length,
        active_users_30d: uniqueUsers30d.length,
        action_type_counts: actionTypeCounts.map(
          (item: { action_type: string; _count: { action_type: number } }) => ({
            action_type: item.action_type,
            count: item._count.action_type,
          }),
        ),
        top_devices: topDevices.map(
          (item: { device_model: string | null; _count: { device_model: number } }) => ({
            device_model: item.device_model,
            count: item._count.device_model,
          }),
        ),
      },
      'Activity stats retrieved successfully',
    );
  }
}
