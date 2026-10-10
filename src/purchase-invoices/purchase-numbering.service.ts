import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

interface LockedFiscalConfigRow {
  id: string;
  nextPurchaseNumber: number;
}

/**
 * Assigns the internal correlative a PurchaseInvoice gets at creation (e.g.
 * COM-0001). Unlike SaleNumberingService, there is no CaiRange branch here —
 * CAI is only for invoices you ISSUE, not ones you receive from a supplier.
 * Must always be called with the SAME transaction client the caller uses to
 * mutate stock, so both commit together or neither does.
 */
@Injectable()
export class PurchaseNumberingService {
  async assignNumber(
    tx: Prisma.TransactionClient,
  ): Promise<{ number: string }> {
    // ponytail: the very first get-or-create of FiscalConfig (if no row
    // exists yet at all) has a one-time, unlocked race window here — not
    // worth retry/upsert machinery for a window that only exists once ever.
    let config = await tx.fiscalConfig.findFirst();
    if (!config) {
      config = await tx.fiscalConfig.create({ data: {} });
    }

    const [locked] = await tx.$queryRaw<LockedFiscalConfigRow[]>(Prisma.sql`
      SELECT "id", "nextPurchaseNumber" FROM "fiscal_config" WHERE "id" = ${config.id} FOR UPDATE
    `);

    await tx.fiscalConfig.update({
      where: { id: locked.id },
      data: { nextPurchaseNumber: { increment: 1 } },
    });

    return {
      number: `COM-${String(locked.nextPurchaseNumber).padStart(4, '0')}`,
    };
  }
}
