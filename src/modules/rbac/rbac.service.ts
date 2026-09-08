import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ResponseUtil } from '../../common/utils/response.util';
import { OrganizationService } from '../organization/organization.service';

@Injectable()
export class RbacService {
  constructor(
    private prisma: PrismaService,
    private organizationService: OrganizationService,
  ) {}

  private buildPermissionKey(screenName: string, action: string) {
    return `${screenName}_${String(action).toLowerCase()}`;
  }

  async getEffectivePermissionsForUser(userId: number, organizationId?: number) {
    const user = await this.prisma.users.findUnique({
      where: { s_no: userId },
      select: {
        s_no: true,
        role_id: true,
        is_deleted: true,
        status: true,
        organization_id: true,
      },
    });

    if (!user || user.is_deleted || user.status !== 'ACTIVE') {
      throw new NotFoundException('User not found');
    }

    const resolvedOrgId = organizationId ?? (user as { organization_id?: number }).organization_id ?? null;
    const now = new Date();

    // Normalize: ACTIVE subscriptions with past end_date should become EXPIRED
    if (resolvedOrgId) {
      await this.prisma.user_subscriptions.updateMany({
        where: {
          organization_id: resolvedOrgId,
          status: 'ACTIVE',
          end_date: { lt: now },
        },
        data: {
          status: 'EXPIRED',
        },
      });
    }

    const [allPermissions, rolePermissionRows, overrideRows, activeSubscription, lastSubscription] = await Promise.all([
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
      resolvedOrgId
        ? this.prisma.user_subscriptions.findFirst({
            where: {
              organization_id: resolvedOrgId,
              status: 'ACTIVE',
              end_date: { gte: now },
            },
            include: { subscription_plans: true },
            orderBy: [
              { start_date: 'desc' },
              { created_at: 'desc' },
              { s_no: 'desc' },
            ],
          })
        : Promise.resolve(null),
      resolvedOrgId
        ? this.prisma.user_subscriptions.findFirst({
            where: {
              organization_id: resolvedOrgId,
              status: { in: ['EXPIRED', 'CANCELLED'] },
            },
            include: { subscription_plans: true },
            orderBy: { end_date: 'desc' },
          })
        : Promise.resolve(null),
    ]);

    const roleGranted = new Set(rolePermissionRows.map((r) => r.permission_id));

    const overridesByPermissionId = new Map<number, { effect: string }>();
    for (const o of overrideRows) {
      if (o.expires_at && new Date(o.expires_at) <= now) continue;
      overridesByPermissionId.set(o.permission_id, { effect: String(o.effect) });
    }

    const permissionsMap: Record<string, boolean> = {};

    for (const p of allPermissions) {
      const key = this.buildPermissionKey(p.screen_name, p.action as string);
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

    const plan = activeSubscription
      ? activeSubscription.subscription_plans ?? null
      : null;

    // A plan is "free" if the backend flags it OR its price is 0.
    // StarterX has is_free=false but price=0, so price is the reliable signal.
    const isPlanFreeByPrice = (p: { is_free?: boolean; price?: string | number } | null): boolean => {
      if (!p) return false;
      if (p.is_free) return true;
      const price = parseFloat(String(p.price ?? ''));
      return Number.isFinite(price) && price <= 0;
    };

    let daysRemaining = 0;
    if (activeSubscription?.end_date) {
      const diffMs = new Date(activeSubscription.end_date).getTime() - now.getTime();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    const lastPlan = lastSubscription
      ? lastSubscription.subscription_plans ?? null
      : null;

    const subscription = {
      has_active_plan: !!activeSubscription,
      is_free_plan: isPlanFreeByPrice(plan) || (!activeSubscription && isPlanFreeByPrice(lastPlan)),
      is_trial: activeSubscription ? Boolean((activeSubscription as { is_trial?: boolean }).is_trial) : false,
      is_expired: !activeSubscription && !!lastSubscription && !isPlanFreeByPrice(lastPlan),
      days_remaining: daysRemaining,
      plan_name: plan?.name ?? (lastPlan ? lastPlan?.name ?? null : null),
    };

    // Reuse the single-source-of-truth logic from OrganizationService
    let isOnboardingComplete = true;
    let onboardingHasRooms = false;
    let onboardingHasTenants = false;
    if (resolvedOrgId) {
      try {
        const onboarding = await this.organizationService.getOnboardingData(resolvedOrgId);
        // is_onboarding_complete = true means onboarding is DONE (no checklist needed)
        isOnboardingComplete = !onboarding.is_new;
        onboardingHasRooms = onboarding.has_rooms;
        onboardingHasTenants = onboarding.has_tenants;
      } catch {
        isOnboardingComplete = true;
      }
    }

    return ResponseUtil.success(
      {
        user_id: userId,
        role_id: user.role_id,
        permissions_map: permissionsMap,
        permissions,
        subscription,
        is_onboarding_complete: isOnboardingComplete,
        onboarding_has_rooms: onboardingHasRooms,
        onboarding_has_tenants: onboardingHasTenants,
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
