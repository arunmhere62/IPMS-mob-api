import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { CommonHeadersDto } from '../dto/common-headers.dto';

export const REQUIRED_HEADERS_KEY = 'requiredHeaders';

export interface RequiredHeadersOptions {
  pg_id?: boolean;
  organization_id?: boolean;
  user_id?: boolean;
}

/**
 * Guard to validate common headers
 * Use @RequireHeaders() decorator to specify which headers are required
 */
@Injectable()
export class HeadersValidationGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const headers = request.headers;

    const readHeader = (key: string): string | undefined => {
      const value = headers[key];
      if (Array.isArray(value)) {
        return value[0];
      }
      return typeof value === 'string' ? value : undefined;
    };

    const parseHeaderInt = (key: string): number | undefined => {
      const raw = readHeader(key);
      if (!raw) return undefined;
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    // Get required headers from decorator metadata
    const requiredHeaders = this.reflector.getAllAndOverride<RequiredHeadersOptions>(
      REQUIRED_HEADERS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Extract and parse headers
    const headerData = {
      pg_id: parseHeaderInt('x-pg-location-id'),
      organization_id: parseHeaderInt('x-organization-id'),
      user_id: parseHeaderInt('x-user-id'),
    };

    // Transform to DTO and validate
    const headersDto = plainToClass(CommonHeadersDto, headerData);
    const errors = await validate(headersDto);

    if (errors.length > 0) {
      const errorMessages = errors
        .map((error) => Object.values(error.constraints || {}).join(', '))
        .join('; ');
      throw new BadRequestException(`Invalid headers: ${errorMessages}`);
    }

    // Check required headers
    if (requiredHeaders) {
      const missingHeaders: string[] = [];

      if (requiredHeaders.pg_id && !headerData.pg_id) {
        missingHeaders.push('x-pg-location-id');
      }
      if (requiredHeaders.organization_id && !headerData.organization_id) {
        missingHeaders.push('x-organization-id');
      }
      if (requiredHeaders.user_id && !headerData.user_id) {
        missingHeaders.push('x-user-id');
      }

      if (missingHeaders.length > 0) {
        throw new BadRequestException(
          `Missing required headers: ${missingHeaders.join(', ')}`,
        );
      }
    }

    // Attach validated headers to request
    request.validatedHeaders = headerData;

    return true;
  }
}
