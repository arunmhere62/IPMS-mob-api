/**
 * Standard API Response DTO
 * All API responses follow this structure for consistency
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  error?: {
    code: string;
    details?: unknown;
  };
  timestamp: string;
  path?: string;
  [key: string]: unknown; // Allow spreading data properties directly
}

export class ApiResponseDto<T = unknown> implements ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  error?: {
    code: string;
    details?: unknown;
  };
  timestamp: string;
  path?: string;
  [key: string]: unknown;

  constructor(
    statusCode: number,
    message: string,
    data?: T,
    error?: { code: string; details?: unknown },
    path?: string,
    meta?: unknown,
  ) {
    this.statusCode = statusCode;
    this.message = message;
    this.success = statusCode >= 200 && statusCode < 300;
    this.error = error;
    this.timestamp = new Date().toISOString();
    this.path = path;

    if (meta !== undefined) {
      this['meta'] = meta;
    }
    
    // Always wrap data in a data property to maintain consistent structure
    if (data !== undefined && data !== null) {
      this['data'] = data;
    }
  }
}
