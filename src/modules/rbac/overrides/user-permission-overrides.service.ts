import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ResponseUtil } from '../../../common/utils/response.util';
import { UpsertUserPermissionOverrideDto } from './dto/upsert-user-permission-override.dto';
import { RemoveUserPermissionOverrideDto } from './dto/remove-user-permission-override.dto';
import { ListUserPermissionOverridesQueryDto } from './dto/list-user-permission-overrides.query.dto';
import { BulkUpsertUserPermissionOverridesDto } from './dto/bulk-upsert-user-permission-overrides.dto';

@Injectable()
export class UserPermissionOverridesService {
  constructor(private prisma: PrismaService) {}

  async list(query: ListUserPermissionOverridesQueryDto) {
    if (!query.user_id && !query.permission_id) {
      throw new BadRequestException('At least one filter (user_id or permission_id) is required');
    }

    const overrides = await this.prisma.user_permission_overrides.findMany({
      where: {
        ...(query.user_id ? { user_id: query.user_id } : {}),
        ...(query.permission_id ? { permission_id: query.permission_id } : {}),
      },
      include: {
        permissions_master: {
          select: {
            s_no: true,
            screen_name: true,
            action: true,
            description: true,
          },
        },
      },
      orderBy: { updated_at: 'desc' },
    });

    return ResponseUtil.success(overrides, 'User permission overrides retrieved successfully');
  }

  async upsert(dto: UpsertUserPermissionOverrideDto, createdBy?: number) {
    const expiresAt = dto.expires_at ? new Date(dto.expires_at) : null;
    if (dto.expires_at && isNaN(expiresAt!.getTime())) {
      throw new BadRequestException('Invalid expires_at (must be ISO date string)');
    }

    const override = await this.prisma.user_permission_overrides.upsert({
      where: {
        user_id_permission_id: {
          user_id: dto.user_id,
          permission_id: dto.permission_id,
        },
      },
      create: {
        user_id: dto.user_id,
        permission_id: dto.permission_id,
        effect: dto.effect as any,
        created_by: createdBy,
        expires_at: expiresAt,
      },
      update: {
        effect: dto.effect as any,
        expires_at: expiresAt,
        updated_at: new Date(),
      },
      include: {
        permissions_master: {
          select: {
            s_no: true,
            screen_name: true,
            action: true,
            description: true,
          },
        },
      },
    });

    return ResponseUtil.success(override, 'User permission override saved successfully');
  }

  async bulkUpsert(dto: BulkUpsertUserPermissionOverridesDto, createdBy?: number) {
    const overrides = dto.overrides ?? [];
    if (!Array.isArray(overrides) || overrides.length === 0) {
      throw new BadRequestException('overrides must be a non-empty array');
    }

    const saved = await this.prisma.$transaction(
      overrides.map((o) => {
        const expiresAt = o.expires_at ? new Date(o.expires_at) : null;
        if (o.expires_at && isNaN(expiresAt!.getTime())) {
          throw new BadRequestException('Invalid expires_at (must be ISO date string)');
        }

        return this.prisma.user_permission_overrides.upsert({
          where: {
            user_id_permission_id: {
              user_id: o.user_id,
              permission_id: o.permission_id,
            },
          },
          create: {
            user_id: o.user_id,
            permission_id: o.permission_id,
            effect: o.effect as any,
            created_by: createdBy,
            expires_at: expiresAt,
          },
          update: {
            effect: o.effect as any,
            expires_at: expiresAt,
            updated_at: new Date(),
          },
          include: {
            permissions_master: {
              select: {
                s_no: true,
                screen_name: true,
                action: true,
                description: true,
              },
            },
          },
        });
      }),
    );

    return ResponseUtil.success(saved, 'User permission overrides saved successfully');
  }

  async remove(dto: RemoveUserPermissionOverrideDto) {
    await this.prisma.user_permission_overrides.delete({
      where: {
        user_id_permission_id: {
          user_id: dto.user_id,
          permission_id: dto.permission_id,
        },
      },
    });

    return ResponseUtil.noContent('User permission override removed successfully');
  }
}
