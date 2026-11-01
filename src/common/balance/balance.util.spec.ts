import { PaymentStatus, Prisma } from '@prisma/client';
import { attachBalances } from './balance.util';

describe('attachBalances', () => {
  const makeGroupBy = (
    sums: Array<{ saleId: string; _sum: { amount: Prisma.Decimal | null } }>,
  ) => jest.fn().mockResolvedValue(sums);

  it('returns an empty array without calling groupBy when there are no rows', async () => {
    const groupBy = makeGroupBy([]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(prisma, [], 'saleId');

    expect(result).toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('computes balance as totalAmount + taxAmount minus the paid sum', async () => {
    const groupBy = makeGroupBy([
      { saleId: 's1', _sum: { amount: new Prisma.Decimal(40) } },
    ]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(
      prisma,
      [
        {
          id: 's1',
          totalAmount: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(15),
        },
      ],
      'saleId',
    );

    expect(result[0].balance).toBe(75);
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
      [{ id: 's1', totalAmount: new Prisma.Decimal(50), taxAmount: null }],
      'saleId',
    );

    expect(result[0].balance).toBe(50);
  });

  it('rounds to 2 decimals', async () => {
    const groupBy = makeGroupBy([
      { saleId: 's1', _sum: { amount: new Prisma.Decimal('33.333') } },
    ]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(
      prisma,
      [
        {
          id: 's1',
          totalAmount: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(0),
        },
      ],
      'saleId',
    );

    expect(result[0].balance).toBe(66.67);
  });

  it('matches each row to its own sum, not a shared total', async () => {
    const groupBy = makeGroupBy([
      { saleId: 's1', _sum: { amount: new Prisma.Decimal(10) } },
      { saleId: 's2', _sum: { amount: new Prisma.Decimal(999) } },
    ]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(
      prisma,
      [
        {
          id: 's1',
          totalAmount: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(0),
        },
        {
          id: 's2',
          totalAmount: new Prisma.Decimal(100),
          taxAmount: new Prisma.Decimal(0),
        },
      ],
      'saleId',
    );

    expect(result.find((r) => r.id === 's1')?.balance).toBe(90);
  });

  it('does not let Decimal + Decimal string-concatenation corrupt the balance (regression for the Float -> Decimal migration)', async () => {
    // Without explicit conversion, `Decimal + Decimal` concatenates their
    // string representations instead of adding (see src/common/money.ts),
    // so a payment that exactly settles the balance would compute a bogus
    // balance instead of 0. totalAmount/taxAmount/paid are all
    // Prisma.Decimal here, the real runtime shape once the schema is
    // numeric(14,2), not the plain numbers a pre-migration test would use.
    const groupBy = makeGroupBy([
      { saleId: 's1', _sum: { amount: new Prisma.Decimal('38.33') } },
    ]);
    const prisma = { payment: { groupBy } } as never;

    const result = await attachBalances(
      prisma,
      [
        {
          id: 's1',
          totalAmount: new Prisma.Decimal('33.33'),
          taxAmount: new Prisma.Decimal('5.00'),
        },
      ],
      'saleId',
    );

    expect(result[0].balance).toBe(0);
  });
});
