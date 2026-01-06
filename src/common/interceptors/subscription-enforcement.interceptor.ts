import {
  BadRequestException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common'
import type { Request } from 'express'
import type { Observable } from 'rxjs'

import { PrismaService } from '../../prisma/prisma.service'

type ValidatedHeaders = {
  pg_id?: number
  organization_id?: number
  user_id?: number
}

type RuleAction =
  | 'create_pg_location'
  | 'create_room'
  | 'create_bed'
  | 'create_tenant'
  | 'create_employee'

type HttpMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET'

type Rule = {
  method: HttpMethod
  path: string
  action: RuleAction
  requiredHeaders: Array<keyof ValidatedHeaders>
}

@Injectable()
export class SubscriptionEnforcementInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  private async getActivePlanForOrganization(organizationId: number) {
    const now = new Date()

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
    })

    if (activeSubscription?.subscription_plans) {
      return activeSubscription.subscription_plans
    }

    const lastSubscription = await this.prisma.user_subscriptions.findFirst({
      where: {
        organization_id: organizationId,
      },
      include: {
        subscription_plans: true,
      },
      orderBy: {
        end_date: 'desc',
      },
    })

    const lastPlan = lastSubscription?.subscription_plans
    if (lastPlan?.is_free && lastSubscription?.end_date) {
      const endedAt = new Date(lastSubscription.end_date)
      if (endedAt.getTime() < now.getTime()) {
        throw new BadRequestException(
          'Your free plan has ended. Please upgrade your plan to continue using this feature.',
        )
      }
    }

    throw new BadRequestException(
      'No active subscription found. Please subscribe to a plan to continue.',
    )
  }

  private async assertCanCreatePgLocationForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId)
    const max = plan.max_pg_locations
    if (max == null) return

    const current = await this.prisma.pg_locations.count({
      where: {
        organization_id: organizationId,
        is_deleted: false,
      },
    })

    if (current >= max) {
      throw new BadRequestException(
        `PG location limit reached. Your current plan allows up to ${max} PG locations. Please upgrade your plan to add more.`,
      )
    }
  }

  private async assertCanCreateRoomForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId)
    const max = plan.max_rooms
    if (max == null) return

    const current = await this.prisma.rooms.count({
      where: {
        is_deleted: false,
        pg_locations: {
          organization_id: organizationId,
          is_deleted: false,
        },
      },
    })

    if (current >= max) {
      throw new BadRequestException(
        `Room limit reached. Your current plan allows up to ${max} rooms per organization. Please upgrade your plan to add more.`,
      )
    }
  }

  private async assertCanCreateRoomInPg(pgId: number) {
    const pgLocation = await this.prisma.pg_locations.findFirst({
      where: {
        s_no: pgId,
        is_deleted: false,
      },
      select: {
        organization_id: true,
      },
    })

    if (!pgLocation) {
      throw new BadRequestException(`PG location with ID ${pgId} not found`)
    }

    return this.assertCanCreateRoomForOrganization(pgLocation.organization_id)
  }

  private async assertCanCreateBedForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId)
    const max = plan.max_beds
    if (max == null) return

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
    })

    if (current >= max) {
      throw new BadRequestException(
        `Bed limit reached. Your current plan allows up to ${max} beds per organization. Please upgrade your plan to add more.`,
      )
    }
  }

  private async assertCanCreateBedInPg(pgId: number) {
    const pgLocation = await this.prisma.pg_locations.findFirst({
      where: {
        s_no: pgId,
        is_deleted: false,
      },
      select: {
        organization_id: true,
      },
    })

    if (!pgLocation) {
      throw new BadRequestException(`PG location with ID ${pgId} not found`)
    }

    return this.assertCanCreateBedForOrganization(pgLocation.organization_id)
  }

  private async assertCanCreateEmployeeForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId)
    const max = plan.max_employees
    if (max == null) return

    const current = await this.prisma.users.count({
      where: {
        organization_id: organizationId,
        is_deleted: false,
        status: 'ACTIVE',
      },
    })

    if (current >= max) {
      throw new BadRequestException(
        `Employee limit reached. Your current plan allows up to ${max} employees. Please upgrade your plan to add more.`,
      )
    }
  }

  private async assertCanCreateTenantForOrganization(organizationId: number) {
    const plan = await this.getActivePlanForOrganization(organizationId)
    const maxTenants = plan.max_tenants
    if (maxTenants == null) return

    const currentTenants = await this.prisma.tenants.count({
      where: {
        is_deleted: false,
        status: 'ACTIVE',
        pg_locations: {
          organization_id: organizationId,
          is_deleted: false,
        },
      },
    })

    if (currentTenants >= maxTenants) {
      throw new BadRequestException(
        `Tenant limit reached. Your current plan allows up to ${maxTenants} tenants. Please upgrade your plan to add more tenants.`,
      )
    }
  }

  private readonly rules: Rule[] = [
    {
      method: 'POST',
      path: '/api/v1/pg-locations',
      action: 'create_pg_location',
      requiredHeaders: ['organization_id', 'user_id'],
    },
    {
      method: 'POST',
      path: '/api/v1/rooms',
      action: 'create_room',
      requiredHeaders: ['pg_id', 'organization_id', 'user_id'],
    },
    {
      method: 'POST',
      path: '/api/v1/beds',
      action: 'create_bed',
      requiredHeaders: ['pg_id', 'organization_id', 'user_id'],
    },
    {
      method: 'POST',
      path: '/api/v1/tenants',
      action: 'create_tenant',
      requiredHeaders: ['pg_id', 'organization_id', 'user_id'],
    },
    {
      method: 'POST',
      path: '/api/v1/employees',
      action: 'create_employee',
      requiredHeaders: ['pg_id', 'organization_id', 'user_id'],
    },
  ]

  private normalizePath(req: Request): string {
    // Strip querystring for stable matching
    const raw = String(req.originalUrl ?? req.url ?? '')
    const pathOnly = raw.split('?')[0] ?? ''
    return pathOnly
  }

  private matchRule(req: Request): Rule | null {
    const method = String(req.method ?? '').toUpperCase() as HttpMethod
    const path = this.normalizePath(req)
    return this.rules.find((r) => r.method === method && r.path === path) ?? null
  }

  private assertRequiredHeaders(rule: Rule, headers: ValidatedHeaders) {
    for (const key of rule.requiredHeaders) {
      if (headers[key] == null) {
        // HeadersValidationGuard + @RequireHeaders should already ensure this.
        // This is only a safety net to avoid silent bypass.
        throw new Error(`Missing required validated header: ${String(key)}`)
      }
    }
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle()
    }

    const req = context.switchToHttp().getRequest<Request>()
    const rule = this.matchRule(req)
    if (!rule) {
      return next.handle()
    }

    const headers = ((req as unknown as { validatedHeaders?: ValidatedHeaders })
      .validatedHeaders ?? {}) as ValidatedHeaders

    this.assertRequiredHeaders(rule, headers)

    const action = rule.action

    if (action === 'create_pg_location') {
      await this.assertCanCreatePgLocationForOrganization(headers.organization_id!)
    }

    if (action === 'create_room') {
      await this.assertCanCreateRoomInPg(headers.pg_id!)
    }

    if (action === 'create_bed') {
      await this.assertCanCreateBedInPg(headers.pg_id!)
    }

    if (action === 'create_employee') {
      await this.assertCanCreateEmployeeForOrganization(headers.organization_id!)
    }

    if (action === 'create_tenant') {
      await this.assertCanCreateTenantForOrganization(headers.organization_id!)
    }

    return next.handle()
  }
}
