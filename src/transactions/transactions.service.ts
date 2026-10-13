import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTransactionDto,
  TransactionItemDto,
  TransactionType,
} from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import {
  PaginationDto,
  PaginatedResult,
  parsePagination,
  buildPaginationMeta,
  parseSortOrder,
} from '../common/dto';
import { EventsService } from '../events/events.service';
import { warehouseFilterMultiField } from '../common/warehouse-access/warehouse-filter.util';
import { StockLevelService } from '../alerts/stock-level.service';
import { computeInventoryStatus } from '../inventory/inventory-status';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private eventsService: EventsService,
    private readonly stockLevelService: StockLevelService,
  ) {}

  async create(createTransactionDto: CreateTransactionDto) {
    const { items, ...transactionData } = createTransactionDto;

    // Validate transaction type requirements
    this.validateTransactionType(createTransactionDto);

    // Validate all items exist
    await this.validateItems(items);

    // Create transaction with items in a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const newTransaction = await tx.transaction.create({
        data: {
          ...transactionData,
          items: {
            create: items.map((item) => ({
              inventoryItemId: item.inventoryItemId,
              quantity: item.quantity,
              notes: item.notes,
            })),
          },
        },
        include: {
          items: {
            include: {
              inventoryItem: true,
            },
          },
          sourceWarehouse: true,
          destinationWarehouse: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      // Update inventory quantities based on transaction type (within same transaction)
      await this.updateInventoryQuantitiesInTx(tx, items, transactionData.type);

      return newTransaction;
    });

    this.eventsService.emitTransactionChange('created', result.id);
    this.eventsService.emitInventoryChange('updated');

    this.stockLevelService.scheduleRefresh();
    return result;
  }

  async findAll(
    pagination?: PaginationDto,
    warehouseIds?: string[] | null,
  ): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = parsePagination(pagination);
    const where = warehouseFilterMultiField(warehouseIds, [
      'sourceWarehouseId',
      'destinationWarehouseId',
    ]);

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: parseSortOrder(pagination?.sortOrder) },
        include: {
          items: { include: { inventoryItem: true } },
          sourceWarehouse: true,
          destinationWarehouse: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findRecent(limit: number = 10, warehouseIds?: string[] | null) {
    const where = warehouseFilterMultiField(warehouseIds, [
      'sourceWarehouseId',
      'destinationWarehouseId',
    ]);

    return this.prisma.transaction.findMany({
      where,
      take: limit,
      orderBy: {
        date: 'desc',
      },
      include: {
        items: {
          include: {
            inventoryItem: true,
          },
        },
        sourceWarehouse: true,
        destinationWarehouse: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            inventoryItem: true,
          },
        },
        sourceWarehouse: true,
        destinationWarehouse: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${id} not found`);
    }

    return transaction;
  }

  async update(id: string, updateTransactionDto: UpdateTransactionDto) {
    try {
      return await this.prisma.transaction.update({
        where: { id },
        data: updateTransactionDto,
        include: {
          items: {
            include: {
              inventoryItem: true,
            },
          },
          sourceWarehouse: true,
          destinationWarehouse: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`Transaction with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id },
        include: { items: { include: { inventoryItem: true } } },
      });
      if (!transaction) {
        throw new NotFoundException(`Transaction with ID ${id} not found`);
      }

      // Deleting undoes the stock movement the transaction made, so the
      // inventory stays consistent. A TRANSFER never changed quantities.
      const type = transaction.type as TransactionType;
      for (const line of transaction.items) {
        if (type === TransactionType.IN) {
          if (line.inventoryItem.quantity < line.quantity) {
            throw new BadRequestException(
              `Cannot delete this entry: undoing it would take ${line.inventoryItem.name} below zero. Available: ${line.inventoryItem.quantity}, to remove: ${line.quantity}`,
            );
          }
          await tx.inventoryItem.update({
            where: { id: line.inventoryItemId },
            data: { quantity: { decrement: line.quantity } },
          });
        } else if (type === TransactionType.OUT) {
          await tx.inventoryItem.update({
            where: { id: line.inventoryItemId },
            data: { quantity: { increment: line.quantity } },
          });
        }
      }

      // Cascades to the transaction items
      await tx.transaction.delete({ where: { id } });
    });

    this.eventsService.emitTransactionChange('deleted', id);
    this.eventsService.emitInventoryChange('updated');

    this.stockLevelService.scheduleRefresh();
  }

  // Helper methods
  private validateTransactionType(dto: CreateTransactionDto) {
    const { type, sourceWarehouseId, destinationWarehouseId } = dto;

    if (type === TransactionType.IN && !destinationWarehouseId) {
      throw new BadRequestException(
        'IN transactions require destinationWarehouseId',
      );
    }

    if (type === TransactionType.OUT && !sourceWarehouseId) {
      throw new BadRequestException(
        'OUT transactions require sourceWarehouseId',
      );
    }

    if (
      type === TransactionType.TRANSFER &&
      (!sourceWarehouseId || !destinationWarehouseId)
    ) {
      throw new BadRequestException(
        'TRANSFER transactions require both sourceWarehouseId and destinationWarehouseId',
      );
    }
  }

  private async validateItems(items: TransactionItemDto[]) {
    const ids = items.map((i) => i.inventoryItemId);
    const found = await this.prisma.inventoryItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (found.length !== ids.length) {
      const foundIds = new Set(found.map((f) => f.id));
      const missingId = ids.find((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Inventory item with ID ${missingId} not found`,
      );
    }
  }

  private async updateInventoryQuantitiesInTx(
    tx: Prisma.TransactionClient,
    items: TransactionItemDto[],
    type: TransactionType,
  ) {
    // Batch-fetch all items in a single query to avoid N+1 inside the transaction
    const ids = items.map((i) => i.inventoryItemId);
    const fetchedItems = await tx.inventoryItem.findMany({
      where: { id: { in: ids } },
    });
    const itemMap = new Map(fetchedItems.map((fi) => [fi.id, fi]));

    for (const item of items) {
      const currentItem = itemMap.get(item.inventoryItemId);

      if (!currentItem) continue;

      let newQuantity = currentItem.quantity;

      // Update quantity based on transaction type
      if (type === TransactionType.IN) {
        newQuantity += item.quantity;
      } else if (type === TransactionType.OUT) {
        // Reject instead of clamping at zero: a clamped OUT could not be
        // undone exactly when the transaction is deleted.
        if (item.quantity > currentItem.quantity) {
          throw new BadRequestException(
            `Insufficient quantity for item ${currentItem.name}. Available: ${currentItem.quantity}, Requested: ${item.quantity}`,
          );
        }
        newQuantity -= item.quantity;
      }
      // TRANSFER doesn't change total quantity, just location

      const newStatus = computeInventoryStatus({
        ...currentItem,
        quantity: newQuantity,
      });

      await tx.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: {
          quantity: newQuantity,
          status: newStatus,
        },
      });
    }
  }
}
