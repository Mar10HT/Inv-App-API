import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  LoggerService,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, url, body, query, params } = request;
    const userAgent = request.get('user-agent') || '';
    const ip = request.ip || request.connection.remoteAddress;
    const userId = (request as any).user?.userId || 'anonymous';

    const startTime = Date.now();
    const sanitizedBody = this.sanitizeBody(body);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const { statusCode } = response;

          const logMessage = `${method} ${url} ${statusCode} - ${duration}ms - ${userId} - ${ip}`;
          if (sanitizedBody && Object.keys(sanitizedBody).length > 0 && method !== 'GET') {
            this.logger.log(`${logMessage} - body: ${JSON.stringify(sanitizedBody)}`, 'HTTP');
          } else {
            this.logger.log(logMessage, 'HTTP');
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          this.logger.error(
            `${method} ${url} ${statusCode} - ${duration}ms - ${userId} - ${ip} - ${error.message}`,
            error.stack,
            'HTTP',
          );
        },
      }),
    );
  }

  private sanitizeBody(body: any): any {
    if (!body) return undefined;

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'currentPassword', 'newPassword', 'token', 'secret'];

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
