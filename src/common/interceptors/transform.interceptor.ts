import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponseDto } from '../dto/response.dto';
import { getApiMs, getPerfStore, shouldIncludePerf } from '../utils/performance-context';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode || 200;

        const includePerf = shouldIncludePerf();
        const store = includePerf ? getPerfStore() : undefined;
        const apiMs = includePerf ? getApiMs() : undefined;
        const meta =
          includePerf && store && typeof apiMs === 'number'
            ? {
                apiMs: Number(apiMs.toFixed(2)),
                dbMs: Number(store.dbMs.toFixed(2)),
                dbQueries: store.dbQueries,
              }
            : undefined;

        // If data is already an ApiResponseDto, return it as is
        if (data instanceof ApiResponseDto) {
          if (meta) (data as any).meta = meta;
          return data;
        }

        // Wrap the data in ApiResponseDto
        const apiResponse = new ApiResponseDto(
          statusCode,
          'Success',
          data,
          undefined,
          request.url,
          meta,
        );
        return apiResponse;
      }),
    );
  }
}
