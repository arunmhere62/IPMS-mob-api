import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtTokenService } from '../jwt.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtTokenService: JwtTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No authorization token provided');
    }

    const token = authHeader.substring(7);
    if (!token) {
      throw new UnauthorizedException('Invalid authorization token');
    }

    const payload = await this.jwtTokenService.verifyAccessToken(token);
    if (!payload) {
      throw new UnauthorizedException('Invalid or expired authorization token');
    }

    request.user = payload;
    request.accessToken = token;

    return true;
  }
}
