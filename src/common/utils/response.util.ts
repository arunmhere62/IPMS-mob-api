/**
 * Response Utility Helper
 * Provides helper methods for creating consistent API responses
 * 
 * Response Structure:
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "message": "Success",
 *   "data": { ... },
 *   "timestamp": "...",
 *   "path": "..."
 * }
 */

import { ApiResponseDto } from '../dto/response.dto';
import { HttpStatus } from '@nestjs/common';
import { getApiMs, getPerfStore, shouldIncludePerf } from './performance-context';

export class ResponseUtil {
  private static getPerfMeta(): { apiMs: number; dbMs: number; dbQueries: number } | undefined {
    if (!shouldIncludePerf()) return undefined;

    const store = getPerfStore();
    const apiMs = getApiMs();
    if (!store || typeof apiMs !== 'number') return undefined;

    return {
      apiMs: Number(apiMs.toFixed(2)),
      dbMs: Number(store.dbMs.toFixed(2)),
      dbQueries: store.dbQueries,
    };
  }

  /**
   * Create a success response
   * The data parameter will be wrapped in the response.data field
   */
  static success<T>(
    data: T,
    message: string = 'Success',
    statusCode: number = HttpStatus.OK,
  ): ApiResponseDto<T> {
    return new ApiResponseDto(statusCode, message, data, undefined, undefined, this.getPerfMeta());
  }

  /**
   * Create a created response (201)
   */
  static created<T>(
    data: T,
    message: string = 'Resource created successfully',
  ): ApiResponseDto<T> {
    return new ApiResponseDto(HttpStatus.CREATED, message, data, undefined, undefined, this.getPerfMeta());
  }

  /**
   * Create a paginated response
   * Returns data with items and pagination at the root level
   */
  static paginated<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
    message: string = 'Success',
  ): ApiResponseDto<{ data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
    return new ApiResponseDto(
      HttpStatus.OK,
      message,
      {
        data,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
      undefined,
      undefined,
      this.getPerfMeta(),
    );
  }

  /**
   * Create a no content response (204)
   */
  static noContent(message: string = 'No content'): ApiResponseDto<null> {
    return new ApiResponseDto(HttpStatus.NO_CONTENT, message, null, undefined, undefined, this.getPerfMeta());
  }

  /**
   * Create an accepted response (202)
   */
  static accepted<T>(
    data: T,
    message: string = 'Request accepted',
  ): ApiResponseDto<T> {
    return new ApiResponseDto(HttpStatus.ACCEPTED, message, data, undefined, undefined, this.getPerfMeta());
  }
}
