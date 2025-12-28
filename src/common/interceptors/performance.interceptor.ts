
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, defer } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { runWithPerfStore, getPerfStore, getApiMs } from '../utils/performance-context';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    return defer(() =>
      runWithPerfStore(() =>
        next.handle().pipe(
          finalize(() => {
            const store = getPerfStore();
            if (!store) return;

            const apiMs = getApiMs();
            if (typeof apiMs === 'number' && apiMs > 1000) {
              const method = request?.method;
              const url = request?.url;
              console.warn(
                `🐌 Slow request: ${method} ${url} took ${apiMs.toFixed(0)}ms (db ${store.dbMs.toFixed(0)}ms, queries ${store.dbQueries})`,
              );
            }
          }),
        ),
      ),
    );
  }
}

