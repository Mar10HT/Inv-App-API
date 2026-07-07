import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  LoggerService,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

interface HttpExceptionBody {
  message?: string | string[];
  error?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const body = exceptionResponse as HttpExceptionBody;
        message = body.message || exception.message;
        error = body.error || 'Error';
      } else {
        message = exceptionResponse;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const prismaError = this.handlePrismaError(exception);
      status = prismaError.status;
      message = prismaError.message;
      error = prismaError.error;
    } else if (exception instanceof Error) {
      message = exception.message;

      // Handle CSRF errors from csrf-csrf library
      if (exception.constructor.name === 'ForbiddenError') {
        status = HttpStatus.FORBIDDEN;
        message = 'Invalid or missing CSRF token';
        error = 'Forbidden';
      }
    }

    // Log the error
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    // Only report unexpected server errors, not routine 4xx client errors.
    // No-ops when SENTRY_DSN isn't configured (see common/sentry.ts).
    if (status >= 500) {
      Sentry.captureException(exception);
    }

    response.status(status).json({
      statusCode: status,
      error,
      message: Array.isArray(message) ? message : [message],
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private handlePrismaError(error: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    error: string;
  } {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with this value already exists',
          error: 'Conflict',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message:
            'Foreign key constraint failed — related record does not exist',
          error: 'Bad Request',
        };
      case 'P2014':
        return {
          status: HttpStatus.BAD_REQUEST,
          message:
            'The change you are trying to make would violate a required relation',
          error: 'Bad Request',
        };
      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Input value is too long for the field',
          error: 'Bad Request',
        };
      case 'P2006':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Invalid value provided for a field',
          error: 'Bad Request',
        };
      case 'P2011':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'A required field is missing a value',
          error: 'Bad Request',
        };
      case 'P2028':
        return {
          status: HttpStatus.REQUEST_TIMEOUT,
          message: 'Database query timed out',
          error: 'Request Timeout',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Database error',
          error: 'Internal Server Error',
        };
    }
  }
}
