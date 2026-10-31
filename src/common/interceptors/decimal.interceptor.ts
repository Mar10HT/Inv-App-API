import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Prisma } from '@prisma/client';

/**
 * Recursively walks a response body converting any Prisma.Decimal to a
 * plain number, so Decimal.prototype.toJSON()'s default string output never
 * reaches the client. Buffer and Date are returned as-is: they are objects
 * but must never be walked as plain objects (Buffer would be destructively
 * iterated byte-by-byte, Date would be flattened to `{}`).
 *
 * Currently a no-op in practice: the Prisma schema is still Float, so no
 * Decimal ever appears in a real response yet. This is here ahead of the
 * schema migration that will introduce them.
 */
function convertDecimals(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) {
    return Number(value);
  }
  if (Buffer.isBuffer(value) || value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(convertDecimals);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, convertDecimals(v)]),
    );
  }
  return value;
}

@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((body) => convertDecimals(body)));
  }
}
