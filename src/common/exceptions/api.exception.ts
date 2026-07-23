/**
 * Custom API Exception
 * Used for throwing consistent errors throughout the application
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, ErrorMessages, ErrorHttpStatus } from '../constants/error-codes';

export class ApiException extends HttpException {
  constructor(
    errorCode: ErrorCode,
    customMessage?: string,
    details?: unknown,
    statusCode?: number,
  ) {
    const message = customMessage || ErrorMessages[errorCode];
    const status = statusCode || ErrorHttpStatus[errorCode] || HttpStatus.INTERNAL_SERVER_ERROR;

    super(
      {
        success: false,
        statusCode: status,
        message,
        error: {
          code: errorCode,
          details: details ?? null,
        },
        timestamp: new Date().toISOString(),
      },
      status,
    );
  }
}

/**
 * Specific exception for validation errors
 */
export class ValidationException extends ApiException {
  constructor(message?: string, details?: unknown) {
    super(ErrorCode.VALIDATION_FAILED, message, details);
  }
}

/**
 * Specific exception for not found errors
 */
export class NotFoundException extends ApiException {
  constructor(message?: string, details?: unknown) {
    super(ErrorCode.RESOURCE_NOT_FOUND, message, details);
  }
}

/**
 * Specific exception for unauthorized access
 */
export class UnauthorizedException extends ApiException {
  constructor(message?: string, details?: unknown) {
    super(ErrorCode.UNAUTHORIZED, message, details);
  }
}

/**
 * Specific exception for forbidden access
 */
export class ForbiddenException extends ApiException {
  constructor(message?: string, details?: unknown) {
    super(ErrorCode.FORBIDDEN, message, details);
  }
}

/**
 * Specific exception for business logic errors
 */
export class BusinessLogicException extends ApiException {
  constructor(message?: string, details?: unknown) {
    super(ErrorCode.BUSINESS_LOGIC_ERROR, message, details);
  }
}

/**
 * Specific exception for conflict/already exists
 */
export class ConflictException extends ApiException {
  constructor(message?: string, details?: unknown) {
    super(ErrorCode.ALREADY_EXISTS, message, details);
  }
}

/**
 * Specific exception for rate limiting
 */
export class RateLimitException extends ApiException {
  constructor(message?: string, details?: unknown) {
    super(ErrorCode.RATE_LIMIT_EXCEEDED, message, details);
  }
}
