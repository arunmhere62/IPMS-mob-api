import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class TenantHeadersValidationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const headers = request.headers;

    // Required header
    const tenantId = headers['x-tenant-id'];
    
    if (!tenantId) {
      throw new BadRequestException('Missing required header: x-tenant-id');
    }

    // Validate tenant_id is a number
    const parsedTenantId = parseInt(tenantId, 10);
    if (isNaN(parsedTenantId) || parsedTenantId <= 0) {
      throw new BadRequestException('Invalid x-tenant-id header: must be a positive number');
    }

    // Optional headers validation
    const pgId = headers['x-pg-id'];
    if (pgId) {
      const parsedPgId = parseInt(pgId, 10);
      if (isNaN(parsedPgId) || parsedPgId <= 0) {
        throw new BadRequestException('Invalid x-pg-id header: must be a positive number');
      }
    }

    const organizationId = headers['x-organization-id'];
    if (organizationId) {
      const parsedOrgId = parseInt(organizationId, 10);
      if (isNaN(parsedOrgId) || parsedOrgId <= 0) {
        throw new BadRequestException('Invalid x-organization-id header: must be a positive number');
      }
    }

    // Validate that the tenant_id from headers matches the JWT token tenantId
    const jwtTenantId = request.user?.tenantId;
    if (jwtTenantId && jwtTenantId !== parsedTenantId) {
      throw new UnauthorizedException('Tenant ID in headers does not match authenticated tenant');
    }

    return true;
  }
}
