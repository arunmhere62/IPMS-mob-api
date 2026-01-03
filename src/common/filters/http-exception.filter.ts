import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponseDto } from '../dto/response.dto';
import { ErrorCode, ErrorMessages } from '../constants/error-codes';
import { getApiMs, getPerfStore, shouldIncludePerf } from '../utils/performance-context';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = ErrorMessages[ErrorCode.INTERNAL_SERVER_ERROR];
    let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    let details: unknown = null;

    // Handle HttpException (including custom ApiException)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as Record<string, unknown>;

        // If it's already our custom format, use it as is
        const err = responseObj.error;
        if (isRecord(err) && typeof err.code === 'string') {
          return response.status(statusCode).json({
            ...responseObj,
            path: request.url,
          });
        }

        // Handle validation errors from class-validator
        if (responseObj.message && Array.isArray(responseObj.message)) {
          message = 'Validation failed';
          errorCode = ErrorCode.VALIDATION_FAILED;
          details = responseObj.message;
        } else if (responseObj.message) {
          message = String(responseObj.message);
        }
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      }
    }
    // Handle Prisma errors
    else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      (exception as { code?: unknown }).code === 'P2002'
    ) {
      statusCode = HttpStatus.CONFLICT;
      message = 'This record already exists';
      errorCode = ErrorCode.ALREADY_EXISTS;
      const meta = (exception as Record<string, unknown>).meta;
      if (isRecord(meta)) {
        details = (meta as Record<string, unknown>).target;
      }
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      (exception as { code?: unknown }).code === 'P2025'
    ) {
      statusCode = HttpStatus.NOT_FOUND;
      message = 'Record not found';
      errorCode = ErrorCode.RESOURCE_NOT_FOUND;
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as { code?: unknown }).code === 'string' &&
      ((exception as { code: string }).code).startsWith('P')
    ) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Database error occurred';
      errorCode = ErrorCode.DATABASE_ERROR;
      details =
        process.env.NODE_ENV === 'development' && isRecord(exception)
          ? (exception as Record<string, unknown>).message
          : null;
    }
    // Handle generic errors
    else if (exception instanceof Error) {
      message = exception.message || ErrorMessages[ErrorCode.INTERNAL_SERVER_ERROR];
      if (process.env.NODE_ENV === 'development') {
        details = exception.stack;
      }
    }

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

    const apiResponse = new ApiResponseDto(
      statusCode,
      message,
      undefined,
      {
        code: errorCode,
        details,
      },
      request.url,
      meta,
    );

    response.status(statusCode).json(apiResponse);
  }
}
