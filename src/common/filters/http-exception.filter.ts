import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponseDto } from '../dto/response.dto';
import { ErrorCode, ErrorMessages, ErrorHttpStatus } from '../constants/error-codes';
import { getApiMs, getPerfStore, shouldIncludePerf } from '../utils/performance-context';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = ErrorMessages[ErrorCode.INTERNAL_SERVER_ERROR];
    let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
    let details: any = null;

    // Handle HttpException (including custom ApiException)
    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as any;

        // If it's already our custom format, use it as is
        if (responseObj.error?.code) {
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
          message = responseObj.message;
        }
      } else if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      }
    }
    // Handle Prisma errors
    else if (exception.code === 'P2002') {
      statusCode = HttpStatus.CONFLICT;
      message = 'This record already exists';
      errorCode = ErrorCode.ALREADY_EXISTS;
      details = exception.meta?.target;
    } else if (exception.code === 'P2025') {
      statusCode = HttpStatus.NOT_FOUND;
      message = 'Record not found';
      errorCode = ErrorCode.RESOURCE_NOT_FOUND;
    } else if (exception.code?.startsWith('P')) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Database error occurred';
      errorCode = ErrorCode.DATABASE_ERROR;
      details = process.env.NODE_ENV === 'development' ? exception.message : null;
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
