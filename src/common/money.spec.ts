import { Prisma } from '@prisma/client';
import { round2, toNumber, sum } from './money';

describe('round2', () => {
  it('rounds plain numbers to 2 decimals', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it('rounds half up, matching Postgres numeric rounding', () => {
    // 4.9995 * 100 == 499.95000000000005 in IEEE-754, which rounds up to 500.
    expect(round2(4.9995)).toBe(5);
  });

  it('accepts a Prisma.Decimal instance', () => {
    expect(round2(new Prisma.Decimal('33.333'))).toBe(33.33);
  });

  it('treats null as 0', () => {
    expect(round2(null)).toBe(0);
  });

  it('treats undefined as 0', () => {
    expect(round2(undefined)).toBe(0);
  });
});

describe('toNumber', () => {
  it('returns a plain number unchanged', () => {
    expect(toNumber(42.5)).toBe(42.5);
  });

  it('converts a Prisma.Decimal instance without rounding', () => {
    expect(toNumber(new Prisma.Decimal('33.3333'))).toBe(33.3333);
  });

  it('treats null as 0', () => {
    expect(toNumber(null)).toBe(0);
  });

  it('treats undefined as 0', () => {
    expect(toNumber(undefined)).toBe(0);
  });
});

describe('sum', () => {
  it('adds a mix of number, Prisma.Decimal, null and undefined', () => {
    const result = sum([
      10,
      new Prisma.Decimal('5.25'),
      null,
      undefined,
      new Prisma.Decimal('2.75'),
    ]);

    expect(result).toBe(18);
  });

  it('never concatenates two Decimal values as strings', () => {
    // Prisma.Decimal + Prisma.Decimal via plain `+` would concatenate
    // ("33.3310.1"); sum() must convert each value to a number first.
    const result = sum([
      new Prisma.Decimal('33.33'),
      new Prisma.Decimal('10.1'),
    ]);

    expect(result).toBe(43.43);
  });

  it('returns 0 for an empty array', () => {
    expect(sum([])).toBe(0);
  });
});
