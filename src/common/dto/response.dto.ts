/**
 * Standard API Response DTO
 * All API responses follow this structure for consistency
 */

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  error?: {
    code: string;
    details?: any;
  };
  timestamp: string;
  path?: string;
  [key: string]: any; // Allow spreading data properties directly
}

export class ApiResponseDto<T = any> implements ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  error?: {
    code: string;
    details?: any;
  };
  timestamp: string;
  path?: string;
  [key: string]: any;

  constructor(
    statusCode: number,
    message: string,
    data?: T,
    error?: { code: string; details?: any },
    path?: string,
    meta?: any,
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
