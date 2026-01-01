import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionRestrictionService {
  constructor(private readonly prisma: PrismaService) {}

  private async getActivePlanForOrganization(organizationId: number) {
    const now = new Date();

    const activeSubscription = await this.prisma.user_subscriptions.findFirst({
      where: {
        organization_id: organizationId,
        status: 'ACTIVE',
        end_date: { gte: now },
      },
      include: {
        subscription_plans: true,
      },
      orderBy: {
        end_date: 'desc',
      },
    });

    if (!activeSubscription?.subscription_plans) {
      throw new BadRequestException('No active subscription found. Please subscribe to a plan to continue.');
    }

    return activeSubscription.subscription_plans;
  }

  async assertCanCreatePgLocationForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId);
    const max = plan.max_pg_locations;
    if (max == null) return;

    const current = await this.prisma.pg_locations.count({
      where: {
        organization_id: organizationId,
        is_deleted: false,
      },
    });

    if (current >= max) {
      throw new BadRequestException(
        `PG location limit reached. Your current plan allows up to ${max} PG locations. Please upgrade your plan to add more.`,
      );
    }
  }

  async assertCanCreateRoomForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId);
    const max = plan.max_rooms;
    if (max == null) return;

    const current = await this.prisma.rooms.count({
      where: {
        is_deleted: false,
        pg_locations: {
          organization_id: organizationId,
          is_deleted: false,
        },
      },
    });

    if (current >= max) {
      throw new BadRequestException(
        `Room limit reached. Your current plan allows up to ${max} rooms per organization. Please upgrade your plan to add more.`,
      );
    }
  }

  async assertCanCreateRoomInPg(pgId: number) {
    const pgLocation = await this.prisma.pg_locations.findFirst({
      where: {
        s_no: pgId,
        is_deleted: false,
      },
      select: {
        organization_id: true,
      },
    });

    if (!pgLocation) {
      throw new BadRequestException(`PG location with ID ${pgId} not found`);
    }

    return this.assertCanCreateRoomForOrganization(pgLocation.organization_id);
  }

  async assertCanCreateRoomForPg(pgId: number) {
    return this.assertCanCreateRoomInPg(pgId);
  }

  async assertCanCreateBedForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId);
    const max = plan.max_beds;
    if (max == null) return;

    const current = await this.prisma.beds.count({
      where: {
        is_deleted: false,
        rooms: {
          is_deleted: false,
          pg_locations: {
            organization_id: organizationId,
            is_deleted: false,
          },
        },
      },
    });

    if (current >= max) {
      throw new BadRequestException(
        `Bed limit reached. Your current plan allows up to ${max} beds per organization. Please upgrade your plan to add more.`,
      );
    }
  }

  async assertCanCreateBedInPg(pgId: number) {
    const pgLocation = await this.prisma.pg_locations.findFirst({
      where: {
        s_no: pgId,
        is_deleted: false,
      },
      select: {
        organization_id: true,
      },
    });

    if (!pgLocation) {
      throw new BadRequestException(`PG location with ID ${pgId} not found`);
    }

    return this.assertCanCreateBedForOrganization(pgLocation.organization_id);
  }

  async assertCanCreateBedForRoom(roomId: number) {
    const room = await this.prisma.rooms.findFirst({
      where: {
        s_no: roomId,
        is_deleted: false,
      },
      select: {
        pg_id: true,
        pg_locations: {
          select: {
            organization_id: true,
            is_deleted: true,
          },
        },
      },
    });

    const pgId = room?.pg_id;
    const orgId = room?.pg_locations?.organization_id;
    const pgDeleted = room?.pg_locations?.is_deleted;

    if (!pgId || !orgId || pgDeleted) {
      throw new BadRequestException(`Room with ID ${roomId} not found`);
    }

    return this.assertCanCreateBedForOrganization(orgId);
  }

  async assertCanCreateEmployeeForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId);
    const max = plan.max_employees;
    if (max == null) return;

    const current = await this.prisma.users.count({
      where: {
        organization_id: organizationId,
        is_deleted: false,
        status: 'ACTIVE',
      },
    });

    if (current >= max) {
      throw new BadRequestException(
        `Employee limit reached. Your current plan allows up to ${max} employees. Please upgrade your plan to add more.`,
      );
    }
  }

  async assertCanCreateTenantForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId);
    const maxTenants = plan.max_tenants;

    if (maxTenants == null) {
      return;
    }

    const currentTenants = await this.prisma.tenants.count({
      where: {
        is_deleted: false,
        status: 'ACTIVE',
        pg_locations: {
          organization_id: organizationId,
          is_deleted: false,
        },
      },
    });

    if (currentTenants >= maxTenants) {
      throw new BadRequestException(
        `Tenant limit reached. Your current plan allows up to ${maxTenants} tenants. Please upgrade your plan to add more tenants.`,
      );
    }
  }
}
