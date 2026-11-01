import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { round2, sum, toNumber } from '../money';

interface BalanceableDoc {
  id: string;
  // Real runtime type once totalAmount/taxAmount are numeric(14,2): a
  // Prisma.Decimal read straight off a Sale/PurchaseInvoice row, not a
  // plain number (see src/common/money.ts for why `+`/`-` on these directly
  // is unsafe).
  totalAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal | null;
}

/**
 * Attaches a computed `balance` to each row: totalAmount + taxAmount -
 * SUM(payment.amount WHERE status = ACTIVE for that row's document). One
 * batched groupBy for the whole page — no N+1 per row. Shared by Sale and
 * PurchaseInvoice list queries, which is why this lives outside both
 * services: unlike computeTotals() (deliberately duplicated per document
 * type since its tax rounding can diverge), this is pure aggregation with
 * no document-specific branching.
 */
export async function attachBalances<T extends BalanceableDoc>(
  prisma: Pick<PrismaService, 'payment'>,
  rows: T[],
  field: 'saleId' | 'purchaseInvoiceId',
): Promise<(T & { balance: number })[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const sums = await prisma.payment.groupBy({
    by: [field],
    where: { [field]: { in: ids }, status: PaymentStatus.ACTIVE },
    _sum: { amount: true },
  } as never);

  const paidMap = new Map<string, Prisma.Decimal | number | null>(
    (sums as Array<Record<string, unknown>>).map((s) => [
      s[field] as string,
      (s._sum as { amount: Prisma.Decimal | number | null }).amount,
    ]),
  );

  return rows.map((r) => ({
    ...r,
    balance: round2(
      sum([r.totalAmount, r.taxAmount]) - toNumber(paidMap.get(r.id)),
    ),
  }));
}
