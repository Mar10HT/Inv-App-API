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
 * Active in practice now: the 19 money/percent fields across InventoryItem,
 * OutflowItem, Sale(Item), FiscalConfig, PurchaseInvoice(Item), Payment and
 * Client are Prisma.Decimal (numeric columns), so this is what keeps those
 * fields serializing as plain numbers instead of Decimal's string form.
 *
 * Exported for AuditService, which needs the same conversion for `changes`
 * payloads before persisting them (see audit.service.ts) — reused instead
 * of re-implemented since it's the exact same "walk an object, convert
 * Decimal, don't touch Buffer/Date" need.
 */
export function convertDecimals(value: unknown): unknown {
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
