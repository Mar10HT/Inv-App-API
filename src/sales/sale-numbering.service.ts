import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

interface LockedCaiRow {
  id: string;
  currentNumber: number;
  rangeEnd: number;
  expiresAt: Date;
  establishmentCode: string;
  emissionPointCode: string;
  documentTypeCode: string;
}

interface LockedFiscalConfigRow {
  id: string;
  fallbackSaleNumber: number;
}

/**
 * Assigns the number a Sale gets the moment it becomes ACTIVE (direct
 * creation or confirming a DRAFT). Must always be called with the SAME
 * transaction client the caller uses to decrement stock, so both commit
 * together or neither does.
 *
 * Takes `tx: Prisma.TransactionClient` rather than injecting PrismaService
 * directly — this service has no state of its own, it only locks/increments
 * a row inside whichever transaction the caller is already running.
 */
@Injectable()
export class SaleNumberingService {
  async assignNumber(
    tx: Prisma.TransactionClient,
  ): Promise<{ number: string }> {
    const caiRows = await tx.$queryRaw<LockedCaiRow[]>(Prisma.sql`
      SELECT "id", "currentNumber", "rangeEnd", "expiresAt",
             "establishmentCode", "emissionPointCode", "documentTypeCode"
      FROM "cai_ranges" WHERE "isActive" = true FOR UPDATE
    `);

    if (caiRows.length > 0) {
      const range = caiRows[0];
      if (range.expiresAt <= new Date()) {
        throw new BadRequestException('CAI range has expired');
      }
      if (range.currentNumber > range.rangeEnd) {
        throw new BadRequestException('CAI range is exhausted');
      }

      await tx.caiRange.update({
        where: { id: range.id },
        data: { currentNumber: { increment: 1 } },
      });

      const correlativo = String(range.currentNumber).padStart(8, '0');
      return {
        number: `${range.establishmentCode}-${range.emissionPointCode}-${range.documentTypeCode}-${correlativo}`,
      };
    }

    // No CAI range active: fall back to FiscalConfig's own correlative.
    // ponytail: the very first get-or-create of FiscalConfig (if no row
    // exists yet at all) has a one-time, unlocked race window here — not
    // worth retry/upsert machinery for a window that only exists once ever.
    let config = await tx.fiscalConfig.findFirst();
    if (!config) {
      config = await tx.fiscalConfig.create({ data: {} });
    }

    const [locked] = await tx.$queryRaw<LockedFiscalConfigRow[]>(Prisma.sql`
      SELECT "id", "fallbackSaleNumber" FROM "fiscal_config" WHERE "id" = ${config.id} FOR UPDATE
    `);

    await tx.fiscalConfig.update({
      where: { id: locked.id },
      data: { fallbackSaleNumber: { increment: 1 } },
    });

    return {
      number: `V-${String(locked.fallbackSaleNumber).padStart(4, '0')}`,
    };
  }
}
