import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface TenantHeaders {
  tenant_id: number;
  pg_id?: number;
  organization_id?: number;
}

export const TenantHeadersDecorator = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): TenantHeaders => {
    const request = ctx.switchToHttp().getRequest();
    const headers = request.headers;

    const tenantId = headers['x-tenant-id'] ? parseInt(headers['x-tenant-id'], 10) : undefined;
    const pgId = headers['x-pg-id'] ? parseInt(headers['x-pg-id'], 10) : undefined;
    const organizationId = headers['x-organization-id'] ? parseInt(headers['x-organization-id'], 10) : undefined;

    if (!tenantId) {
      throw new Error('x-tenant-id header is required');
    }

    return {
      tenant_id: tenantId,
      pg_id: pgId,
      organization_id: organizationId,
    };
  },
);
