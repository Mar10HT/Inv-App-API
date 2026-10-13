import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type NumberedDocument = 'LOAN' | 'TRANSFER' | 'OUTFLOW' | 'QUOTE';

// Prefix and FiscalConfig counter column per document. Column names are
// interpolated into SQL below, so they come only from this fixed map.
const SEQUENCES: Record<
  NumberedDocument,
  {
    prefix: string;
    counter:
      | 'nextLoanNumber'
      | 'nextTransferNumber'
      | 'nextOutflowNumber'
      | 'nextQuoteNumber';
  }
> = {
  LOAN: { prefix: 'PRE', counter: 'nextLoanNumber' },
  TRANSFER: { prefix: 'TRA', counter: 'nextTransferNumber' },
  OUTFLOW: { prefix: 'SAL', counter: 'nextOutflowNumber' },
  QUOTE: { prefix: 'COT', counter: 'nextQuoteNumber' },
};

/**
 * Assigns the automatic correlative of a loan (PRE-0001), transfer
 * (TRA-0001), outflow (SAL-0001) or quotation (COT-0001), the same way
 * PurchaseNumberingService does for purchases: lock the FiscalConfig row,
 * take its counter, increment it. Must be called with the caller's own
 * transaction client so the number is only consumed if the document is saved.
 */
@Injectable()
export class DocumentNumberingService {
  async assignNumber(
    tx: Prisma.TransactionClient,
    document: NumberedDocument,
  ): Promise<string> {
    const { prefix, counter } = SEQUENCES[document];

    // ponytail: the very first get-or-create of FiscalConfig (if no row
    // exists yet at all) has a one-time, unlocked race window here, same as
    // PurchaseNumberingService; not worth retry machinery for a one-off.
    let config = await tx.fiscalConfig.findFirst();
    if (!config) {
      config = await tx.fiscalConfig.create({ data: {} });
    }

    const [locked] = await tx.$queryRaw<{ id: string; value: number }[]>(
      Prisma.sql`SELECT "id", ${Prisma.raw(`"${counter}"`)} AS "value" FROM "fiscal_config" WHERE "id" = ${config.id} FOR UPDATE`,
    );

    await tx.fiscalConfig.update({
      where: { id: locked.id },
      data: { [counter]: { increment: 1 } },
    });

    return `${prefix}-${String(locked.value).padStart(4, '0')}`;
  }
}
