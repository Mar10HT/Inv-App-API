import { of } from 'rxjs';
import type { ExecutionContext, CallHandler } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DecimalInterceptor } from './decimal.interceptor';

describe('DecimalInterceptor', () => {
  let interceptor: DecimalInterceptor;

  // The interceptor never reads context, only transforms next.handle()'s body.
  const ctx = {} as ExecutionContext;

  beforeEach(() => {
    interceptor = new DecimalInterceptor();
  });

  it('converts a Prisma.Decimal nested in an object inside an array inside an object to a number', (done) => {
    const body = {
      total: new Prisma.Decimal('99.99'),
      items: [
        { price: new Prisma.Decimal('10.5') },
        { price: new Prisma.Decimal('20.25') },
      ],
    };
    const next: CallHandler = { handle: () => of(body) };

    interceptor.intercept(ctx, next).subscribe({
      next: (result: unknown) => {
        const typed = result as {
          total: number;
          items: Array<{ price: number }>;
        };
        expect(typed).toEqual({
          total: 99.99,
          items: [{ price: 10.5 }, { price: 20.25 }],
        });
        expect(typeof typed.total).toBe('number');
        expect(typeof typed.items[0].price).toBe('number');
        done();
      },
    });
  });

  it('passes a Buffer through untouched, without iterating its bytes', (done) => {
    const buffer = Buffer.from('pdf-bytes');
    const next: CallHandler = { handle: () => of({ file: buffer }) };

    interceptor.intercept(ctx, next).subscribe({
      next: (result: unknown) => {
        const typed = result as { file: Buffer };
        expect(Buffer.isBuffer(typed.file)).toBe(true);
        expect(typed.file).toBe(buffer);
        done();
      },
    });
  });

  it('passes a Date through untouched, not as a plain object', (done) => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const next: CallHandler = { handle: () => of({ createdAt: date }) };

    interceptor.intercept(ctx, next).subscribe({
      next: (result: unknown) => {
        const typed = result as { createdAt: Date };
        expect(typed.createdAt instanceof Date).toBe(true);
        expect(typed.createdAt).toBe(date);
        done();
      },
    });
  });

  it.each([
    ['null', null],
    ['empty string', ''],
    ['zero', 0],
    ['false', false],
  ])('passes falsy primitive %s through unchanged', (_label, value) => {
    // of(...) emits synchronously, so the result is available right after subscribe.
    let result: unknown;
    const next: CallHandler = { handle: () => of({ value }) };
    interceptor.intercept(ctx, next).subscribe((r: unknown) => {
      result = r;
    });

    expect((result as { value: unknown }).value).toBe(value);
  });
});
