import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedRequest {
  headers: { authorization?: string };
  user?: unknown;
}

@Injectable()
export class TenantJwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No authorization token provided');
    }

    try {
      // Use tenant JWT secret instead of admin secret
      const secret = this.configService.get<string>('tenantJwt.secret');
      const payload = await this.jwtService.verifyAsync(token, {
        secret,
      });

      // Attach tenant info to request
      request.user = {
        s_no: payload.sub,
        tenantId: payload.tenantId,
        phone: payload.phone,
        role: payload.role,
        pgId: payload.pgId,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired tenant authorization token');
    }
  }

  private extractTokenFromHeader(request: AuthenticatedRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
