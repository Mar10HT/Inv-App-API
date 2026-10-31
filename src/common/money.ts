import { Prisma } from '@prisma/client';

type MoneyInput = number | Prisma.Decimal | null | undefined;

/**
 * Converts a money value to a plain number, treating null/undefined as 0.
 *
 * Never use `Number(n)` or `+n` directly on a raw Prisma.Decimal in a sum:
 * `Prisma.Decimal + Prisma.Decimal` via `+` concatenates their string
 * representations instead of adding. This always converts explicitly first.
 */
export function toNumber(n: MoneyInput): number {
  return Number(n ?? 0);
}

/**
 * Rounds a money value to 2 decimals. `Math.round` rounds half-up (toward
 * +Infinity), matching Postgres `numeric` rounding for non-negative amounts.
 * For negative amounts (e.g. a credit balance from an overpayment) the two
 * diverge at an exact .xx5 halfway tie: Postgres rounds half away from zero,
 * `Math.round` rounds half toward +Infinity. Call sites in this codebase
 * round already-rounded totals, so an exact halfway tie does not occur in
 * practice, but this is not a general Postgres-parity guarantee for negatives.
 */
export function round2(n: MoneyInput): number {
  return Math.round(toNumber(n) * 100) / 100;
}

/** Sums money values, converting each one before adding; null/undefined count as 0. */
export function sum(values: MoneyInput[]): number {
  return values.reduce<number>((total, v) => total + toNumber(v), 0);
}
