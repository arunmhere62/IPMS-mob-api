import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';
export const REQUIRED_RESOURCE_KEY = 'requiredRbacResource';
export const REQUIRED_SUPER_ADMIN_KEY = 'requiredSuperAdmin';

export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);

export const RbacResource = (resource: string) =>
  SetMetadata(REQUIRED_RESOURCE_KEY, resource);

export const RequireSuperAdmin = () => SetMetadata(REQUIRED_SUPER_ADMIN_KEY, true);
