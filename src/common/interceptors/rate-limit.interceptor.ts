import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly requestCounts = new Map<string, { count: number; resetTime: number }>();
  private readonly maxRequests = 100; // Max requests per minute per IP
  private readonly windowMs = 60000; // 1 minute window

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const clientIP = request.ip || request.connection.remoteAddress;
    
    // Simple rate limiting
    const now = Date.now();
    const key = clientIP;
    const record = this.requestCounts.get(key);

    if (!record || now > record.resetTime) {
      this.requestCounts.set(key, { count: 1, resetTime: now + this.windowMs });
    } else {
      record.count++;
      if (record.count > this.maxRequests) {
        throw new Error('Too many requests');
      }
    }

    const startTime = Date.now();
    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        if (duration > 1000) { // Log slow requests
          console.warn(`🐌 Slow request: ${request.method} ${request.url} took ${duration}ms`);
        }
      }),
    );
  }
}
