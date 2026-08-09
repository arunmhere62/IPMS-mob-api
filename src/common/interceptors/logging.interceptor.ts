import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '-';
    const userId = (request as any).user?.sub || (request.headers['x-user-id'] as string) || '-';
    const startTime = Date.now();

    // Skip health check logs to avoid noise
    if (url.includes('/health')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const statusCode = response.statusCode;
        const duration = Date.now() - startTime;

        const logMessage = `${method} ${url} ${statusCode} ${duration}ms - ${ip} user=${userId} ua="${userAgent}"`;

        if (statusCode >= 500) {
          this.logger.error(logMessage);
        } else if (statusCode >= 400) {
          this.logger.warn(logMessage);
        } else if (duration > 1000) {
          this.logger.warn(`🐌 ${logMessage}`);
        } else {
          this.logger.log(logMessage);
        }
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        const statusCode = error?.status || 500;

        const errorLog = `${method} ${url} ${statusCode} ${duration}ms - ${ip} user=${userId} ERROR: ${error.message}`;

        if (statusCode >= 500) {
          this.logger.error(errorLog, error.stack);
        } else {
          this.logger.warn(errorLog);
        }

        return throwError(() => error);
      }),
    );
  }
}
