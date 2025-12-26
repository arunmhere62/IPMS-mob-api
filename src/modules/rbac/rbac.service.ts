import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';

@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  private buildPermissionKey(screenName: string, action: string) {
    return `${screenName}_${String(action).toLowerCase()}`;
  }

  async getEffectivePermissionsForUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { s_no: userId },
      select: {
        s_no: true,
        role_id: true,
        is_deleted: true,
        status: true,
      },
    });

    if (!user || user.is_deleted || user.status !== 'ACTIVE') {
      throw new NotFoundException('User not found');
    }

    const [allPermissions, rolePermissionRows, overrideRows] = await Promise.all([
      this.prisma.permissions_master.findMany({
        select: {
          s_no: true,
          screen_name: true,
          action: true,
          description: true,
        },
        orderBy: { screen_name: 'asc' },
      }),
      this.prisma.role_permissions.findMany({
        where: { role_id: user.role_id },
        select: { permission_id: true },
      }),
      this.prisma.user_permission_overrides.findMany({
        where: { user_id: userId },
        select: { permission_id: true, effect: true, expires_at: true },
      }),
    ]);

    const roleGranted = new Set(rolePermissionRows.map((r) => r.permission_id));

    const now = new Date();
    const overridesByPermissionId = new Map<number, { effect: string }>();
    for (const o of overrideRows) {
      if (o.expires_at && new Date(o.expires_at) <= now) continue;
      overridesByPermissionId.set(o.permission_id, { effect: String(o.effect) });
    }

    const permissionsMap: Record<string, boolean> = {};

    for (const p of allPermissions) {
      const key = this.buildPermissionKey(p.screen_name, p.action as any);
      const override = overridesByPermissionId.get(p.s_no);

      let allowed = false;
      if (override?.effect === 'DENY') {
        allowed = false;
      } else if (override?.effect === 'ALLOW') {
        allowed = true;
      } else if (roleGranted.has(p.s_no)) {
        allowed = true;
      }

      permissionsMap[key] = allowed;
    }

    const permissions = Object.entries(permissionsMap)
      .filter(([, allowed]) => allowed)
      .map(([key]) => key);

    return ResponseUtil.success(
      {
        user_id: userId,
        role_id: user.role_id,
        permissions_map: permissionsMap,
        permissions,
      },
      'Effective permissions retrieved successfully',
    );
  }

  async listPermissionsCatalog() {
    const permissions = await this.prisma.permissions_master.findMany({
      select: {
        s_no: true,
        screen_name: true,
        action: true,
        description: true,
      },
      orderBy: [{ screen_name: 'asc' }, { action: 'asc' }],
    });

    return ResponseUtil.success(permissions, 'Permissions retrieved successfully');
  }

  async listPermissionsCatalogGrouped() {
    const permissions = await this.prisma.permissions_master.findMany({
      select: {
        s_no: true,
        screen_name: true,
        action: true,
        description: true,
      },
      orderBy: [{ screen_name: 'asc' }, { action: 'asc' }],
    });

    const grouped = permissions.reduce((acc, p) => {
      const key = p.screen_name || 'general';
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    }, {} as Record<string, typeof permissions>);

    return ResponseUtil.success(grouped, 'Grouped permissions retrieved successfully');
  }
}
