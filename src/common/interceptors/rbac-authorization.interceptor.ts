import {
  ForbiddenException,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { JwtTokenService } from '../../modules/auth/jwt.service';
import { RbacService } from '../../modules/rbac/rbac.service';
import {
  REQUIRED_PERMISSION_KEY,
  REQUIRED_RESOURCE_KEY,
  REQUIRED_SUPER_ADMIN_KEY,
} from '../decorators/require-permission.decorator';

type PermissionRequest = Request & {
  user?: Record<string, unknown>;
};

@Injectable()
export class RbacAuthorizationInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtTokenService: JwtTokenService,
    private readonly rbacService: RbacService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const explicitPermission = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const resource = this.reflector.getAllAndOverride<string>(REQUIRED_RESOURCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiresSuperAdmin = this.reflector.getAllAndOverride<boolean>(REQUIRED_SUPER_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const actionByMethod: Record<string, string> = {
      GET: 'view',
      HEAD: 'view',
      POST: 'create',
      PUT: 'edit',
      PATCH: 'edit',
      DELETE: 'delete',
    };
    const method = String(context.switchToHttp().getRequest<Request>().method).toUpperCase();
    const action = actionByMethod[method];
    const permission = explicitPermission ?? (resource && action ? `${resource}_${action}` : undefined);

    if (!permission && !requiresSuperAdmin && !resource) return next.handle();
    if (resource && !permission) {
      throw new ForbiddenException('No RBAC action is mapped to this HTTP method');
    }

    const request = context.switchToHttp().getRequest<PermissionRequest>();
    const authorization = request.headers.authorization;
    const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    if (!token) throw new UnauthorizedException('No authorization token provided');

    const payload = await this.jwtTokenService.verifyAccessToken(token);
    const userId = Number(payload?.sub);
    if (!payload || !Number.isSafeInteger(userId) || userId <= 0) {
      throw new UnauthorizedException('Invalid or expired authorization token');
    }

    const organizationId = payload.organization_id == null ? null : Number(payload.organization_id);
    const headerUserId = request.headers['x-user-id'];
    const headerOrganizationId = request.headers['x-organization-id'];
    if (headerUserId != null && Number(headerUserId) !== userId) {
      throw new ForbiddenException('User header does not match the authenticated user');
    }
    if (headerOrganizationId != null && Number(headerOrganizationId) !== organizationId) {
      throw new ForbiddenException('Organization header does not match the authenticated user');
    }

    const authorizationResult = await this.rbacService.checkAuthorization(
      userId,
      organizationId,
      permission,
    );
    request.user = {
      ...payload,
      sub: userId,
      s_no: userId,
      role_name: authorizationResult.roleName,
    };

    if (requiresSuperAdmin && !authorizationResult.isSuperAdmin) {
      throw new ForbiddenException('Super Admin access is required');
    }
    if (permission && !authorizationResult.allowed) {
      throw new ForbiddenException(`Missing required permission: ${permission}`);
    }

    return next.handle();
  }
}
