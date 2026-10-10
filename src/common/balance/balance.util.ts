import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface BalanceableDoc {
  id: string;
  totalAmount: number;
  taxAmount: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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

  const paidMap = new Map<string, number>(
    (sums as Array<Record<string, unknown>>).map((s) => [
      s[field] as string,
      (s._sum as { amount: number | null }).amount ?? 0,
    ]),
  );

  return rows.map((r) => ({
    ...r,
    balance: round2(
      r.totalAmount + (r.taxAmount ?? 0) - (paidMap.get(r.id) ?? 0),
    ),
  }));
}
