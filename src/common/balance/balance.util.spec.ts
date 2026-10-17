import { PaymentStatus } from '@prisma/client';
import { attachBalances } from './balance.util';

describe('attachBalances', () => {
  const makeGroupBy = (
    sums: Array<{ saleId: string; _sum: { amount: number | null } }>,
  ) => jest.fn().mockResolvedValue(sums);

  it('returns an empty array without calling groupBy when there are no rows', async () => {
    const groupBy = makeGroupBy([]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(prisma, [], 'saleId');

    expect(result).toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('computes balance as totalAmount + taxAmount minus the paid sum', async () => {
    const groupBy = makeGroupBy([{ saleId: 's1', _sum: { amount: 40 } }]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(
      prisma,
      [{ id: 's1', totalAmount: 100, taxAmount: 15 }],
      'saleId',
    );

    expect(result).toEqual([
      { id: 's1', totalAmount: 100, taxAmount: 15, balance: 75 },
    ]);
    expect(groupBy).toHaveBeenCalledWith({
      by: ['saleId'],
      where: { saleId: { in: ['s1'] }, status: PaymentStatus.ACTIVE },
      _sum: { amount: true },
    });
  });

  it('treats a document with no payments at all as 0 paid', async () => {
    const groupBy = makeGroupBy([]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(
      prisma,
      [{ id: 's1', totalAmount: 50, taxAmount: null }],
      'saleId',
    );

    expect(result).toEqual([
      { id: 's1', totalAmount: 50, taxAmount: null, balance: 50 },
    ]);
  });

  it('rounds to 2 decimals', async () => {
    const groupBy = makeGroupBy([{ saleId: 's1', _sum: { amount: 33.333 } }]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(
      prisma,
      [{ id: 's1', totalAmount: 100, taxAmount: 0 }],
      'saleId',
    );

    expect(result[0].balance).toBe(66.67);
  });

  it('matches each row to its own sum, not a shared total', async () => {
    const groupBy = makeGroupBy([
      { saleId: 's1', _sum: { amount: 10 } },
      { saleId: 's2', _sum: { amount: 999 } },
    ]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(
      prisma,
      [
        { id: 's1', totalAmount: 100, taxAmount: 0 },
        { id: 's2', totalAmount: 100, taxAmount: 0 },
      ],
      'saleId',
    );

    expect(result.find((r) => r.id === 's1')?.balance).toBe(90);
  });
});
