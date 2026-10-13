import { Injectable } from '@nestjs/common';
import {
  DischargeRequestStatus,
  RequestStatus,
  SaleStatus,
  StockTakeStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type MovementType = 'IN' | 'OUT' | 'TRANSFER';
export type MovementOrigin =
  | 'TRANSACTION'
  | 'SALE'
  | 'PURCHASE'
  | 'OUTFLOW'
  | 'TRANSFER'
  | 'STOCK_TAKE'
  | 'DISCHARGE';

interface WarehouseRef {
  id: string;
  name: string;
}

interface ItemRef {
  id: string;
  name: string;
  sku: string | null;
}

export interface StockMovementLine {
  inventoryItemId: string;
  quantity: number;
  inventoryItem: ItemRef | null;
}

/**
 * Shaped like a manual Transaction (type, warehouses, user, notes, item
 * lines) so the screens and exports built for transactions read it as is,
 * plus where it came from.
 */
export interface StockMovement {
  /** Unique per movement: origin, document id and phase. */
  id: string;
  date: Date;
  type: MovementType;
  origin: MovementOrigin;
  /** True for the stock a cancellation put back (or took back out). */
  cancellation: boolean;
  /** The document's own number (V-0001, COM-0001, SAL-0001, TRA-0001...). */
  reference: string | null;
  notes: string | null;
  sourceWarehouseId: string | null;
  destinationWarehouseId: string | null;
  sourceWarehouse: WarehouseRef | null;
  destinationWarehouse: WarehouseRef | null;
  user: { name: string | null; email: string } | null;
  items: StockMovementLine[];
}

const warehouseSelect = { select: { id: true, name: true } } as const;
const userSelect = { select: { name: true, email: true } } as const;
const itemSelect = { select: { id: true, name: true, sku: true } } as const;
const linesSelect = {
  select: { inventoryItemId: true, quantity: true, inventoryItem: itemSelect },
} as const;

const between = (
  source: WarehouseRef | null,
  destination: WarehouseRef | null,
) => ({
  sourceWarehouseId: source?.id ?? null,
  destinationWarehouseId: destination?.id ?? null,
  sourceWarehouse: source,
  destinationWarehouse: destination,
});

/**
 * Every stock movement in the system, read from the documents that cause
 * them, so Reports' Transactions and Trends tabs show sales, purchases,
 * outflows, transfers, stock takes and discharges next to the manual
 * transactions instead of the manual ones only. Nothing is copied into the
 * transactions table, so there is a single source of truth per movement.
 *
 * Loans are left out on purpose: lending an item doesn't change any
 * warehouse's quantity.
 */
@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(warehouseIds: string[] | null): Promise<StockMovement[]> {
    const single = warehouseIds ? { warehouseId: { in: warehouseIds } } : {};
    const pair = warehouseIds
      ? {
          OR: [
            { sourceWarehouseId: { in: warehouseIds } },
            { destinationWarehouseId: { in: warehouseIds } },
          ],
        }
      : {};

    const [
      transactions,
      sales,
      purchases,
      outflows,
      transfers,
      stockTakes,
      discharges,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: pair,
        include: {
          sourceWarehouse: warehouseSelect,
          destinationWarehouse: warehouseSelect,
          user: userSelect,
          items: linesSelect,
        },
      }),
      this.prisma.sale.findMany({
        where: { ...single, status: { not: SaleStatus.DRAFT } },
        include: {
          warehouse: warehouseSelect,
          createdBy: userSelect,
          cancelledBy: userSelect,
          items: linesSelect,
        },
      }),
      this.prisma.purchaseInvoice.findMany({
        where: single,
        include: {
          warehouse: warehouseSelect,
          createdBy: userSelect,
          cancelledBy: userSelect,
          items: linesSelect,
        },
      }),
      this.prisma.outflow.findMany({
        where: single,
        include: {
          warehouse: warehouseSelect,
          createdBy: userSelect,
          cancelledBy: userSelect,
          items: linesSelect,
        },
      }),
      this.prisma.transferRequest.findMany({
        where: { ...pair, status: RequestStatus.COMPLETED },
        include: {
          sourceWarehouse: warehouseSelect,
          destinationWarehouse: warehouseSelect,
          receivedBy: userSelect,
          requestedBy: userSelect,
          items: linesSelect,
        },
      }),
      this.prisma.stockTake.findMany({
        where: {
          ...single,
          status: StockTakeStatus.COMPLETED,
          adjustmentsApplied: true,
        },
        include: {
          warehouse: warehouseSelect,
          completedBy: userSelect,
          items: {
            select: {
              itemId: true,
              expectedQty: true,
              countedQty: true,
              item: itemSelect,
            },
          },
        },
      }),
      this.prisma.dischargeRequest.findMany({
        where: { ...single, status: DischargeRequestStatus.COMPLETED },
        include: {
          warehouse: warehouseSelect,
          resolvedBy: userSelect,
          items: linesSelect,
        },
      }),
    ]);

    const movements: StockMovement[] = [];

    for (const t of transactions) {
      movements.push({
        id: `TRANSACTION:${t.id}`,
        date: t.date,
        type: t.type as MovementType,
        origin: 'TRANSACTION',
        cancellation: false,
        reference: null,
        notes: t.notes,
        ...between(t.sourceWarehouse, t.destinationWarehouse),
        user: t.user,
        items: t.items,
      });
    }

    // Documents that take stock out when saved and put it back if cancelled
    // (sales, outflows), or the other way round (purchases).
    const pushDocument = (
      origin: 'SALE' | 'PURCHASE' | 'OUTFLOW',
      doc: {
        id: string;
        number: string | null;
        notes: string | null;
        createdAt: Date;
        cancelledAt: Date | null;
        warehouse: WarehouseRef;
        createdBy: StockMovement['user'];
        cancelledBy: StockMovement['user'];
        items: StockMovementLine[];
      },
      savedAt: Date,
      savedType: 'IN' | 'OUT',
    ) => {
      const at = (type: 'IN' | 'OUT') =>
        type === 'IN'
          ? between(null, doc.warehouse)
          : between(doc.warehouse, null);
      const base = {
        origin,
        reference: doc.number,
        notes: doc.notes,
        items: doc.items,
      };
      movements.push({
        ...base,
        ...at(savedType),
        id: `${origin}:${doc.id}`,
        date: savedAt,
        type: savedType,
        cancellation: false,
        user: doc.createdBy,
      });
      if (doc.cancelledAt) {
        const undoType = savedType === 'IN' ? 'OUT' : 'IN';
        movements.push({
          ...base,
          ...at(undoType),
          id: `${origin}:${doc.id}:cancel`,
          date: doc.cancelledAt,
          type: undoType,
          cancellation: true,
          user: doc.cancelledBy,
        });
      }
    };

    // A quotation moved stock when confirmed, not when created.
    for (const s of sales)
      pushDocument('SALE', s, s.confirmedAt ?? s.createdAt, 'OUT');
    for (const p of purchases) pushDocument('PURCHASE', p, p.createdAt, 'IN');
    for (const o of outflows) pushDocument('OUTFLOW', o, o.createdAt, 'OUT');

    for (const tr of transfers) {
      movements.push({
        id: `TRANSFER:${tr.id}`,
        date: tr.receivedAt ?? tr.updatedAt,
        type: 'TRANSFER',
        origin: 'TRANSFER',
        cancellation: false,
        reference: tr.number,
        notes: tr.notes,
        ...between(tr.sourceWarehouse, tr.destinationWarehouse),
        user: tr.receivedBy ?? tr.requestedBy,
        items: tr.items,
      });
    }

    // A stock take can raise some counts and lower others: one movement each
    // way, each line carrying how much that item went up or down.
    for (const st of stockTakes) {
      const lines = st.items
        .filter((i) => i.countedQty !== null)
        .map((i) => ({
          inventoryItemId: i.itemId,
          inventoryItem: i.item,
          diff: (i.countedQty as number) - i.expectedQty,
        }));
      const date = st.completedAt ?? st.updatedAt;
      const side = (type: 'IN' | 'OUT') => {
        const picked = lines.filter((l) =>
          type === 'IN' ? l.diff > 0 : l.diff < 0,
        );
        if (picked.length === 0) return;
        movements.push({
          id: `STOCK_TAKE:${st.id}:${type.toLowerCase()}`,
          date,
          type,
          origin: 'STOCK_TAKE',
          cancellation: false,
          reference: null,
          notes: st.notes,
          ...(type === 'IN'
            ? between(null, st.warehouse)
            : between(st.warehouse, null)),
          user: st.completedBy,
          items: picked.map((l) => ({
            inventoryItemId: l.inventoryItemId,
            inventoryItem: l.inventoryItem,
            quantity: Math.abs(l.diff),
          })),
        });
      };
      side('IN');
      side('OUT');
    }

    for (const d of discharges) {
      movements.push({
        id: `DISCHARGE:${d.id}`,
        date: d.resolvedAt ?? d.updatedAt,
        type: 'OUT',
        origin: 'DISCHARGE',
        cancellation: false,
        reference: null,
        notes: d.notes,
        ...between(d.warehouse, null),
        user: d.resolvedBy,
        items: d.items,
      });
    }

    return movements.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}
