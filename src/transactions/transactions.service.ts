import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getPrismaErrorCode } from '../common/prisma-error.util';
import { CreateTransactionDto, TransactionItemDto, TransactionType } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaginationDto, PaginatedResult, parsePagination, buildPaginationMeta, parseSortOrder } from '../common/dto';
import { EventsService } from '../events/events.service';
import { warehouseFilterMultiField } from '../common/warehouse-access/warehouse-filter.util';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private eventsService: EventsService,
  ) {}

  async create(createTransactionDto: CreateTransactionDto) {
    const { items, ...transactionData } = createTransactionDto;

    // Validate transaction type requirements
    this.validateTransactionType(createTransactionDto);

    // Validate all items exist
    await this.validateItems(items);

    // Create transaction with items in a single transaction
    const result = await this.prisma.tenant().$transaction(async (tx) => {
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
      await this.updateInventoryQuantitiesInTx(tx, items, transactionData.type as TransactionType);

      return newTransaction;
    });

    this.eventsService.emitTransactionChange('created', result.id);
    this.eventsService.emitInventoryChange('updated');

    return result;
  }

  async findAll(pagination?: PaginationDto, warehouseIds?: string[] | null): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = parsePagination(pagination);
    const where = warehouseFilterMultiField(warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']);

    const [data, total] = await Promise.all([
      this.prisma.tenant().transaction.findMany({
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
      this.prisma.tenant().transaction.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findRecent(limit: number = 10, warehouseIds?: string[] | null) {
    const where = warehouseFilterMultiField(warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']);

    return this.prisma.tenant().transaction.findMany({
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
    const transaction = await this.prisma.tenant().transaction.findUnique({
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
      return await this.prisma.tenant().transaction.update({
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
      if (getPrismaErrorCode(error) === 'P2025') {
        throw new NotFoundException(`Transaction with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      // Note: This will cascade delete transaction items
      await this.prisma.tenant().transaction.delete({
        where: { id },
      });
    } catch (error: unknown) {
      if (getPrismaErrorCode(error) === 'P2025') {
        throw new NotFoundException(`Transaction with ID ${id} not found`);
      }
      throw error;
    }
  }

  // Helper methods
  private validateTransactionType(dto: CreateTransactionDto) {
    const { type, sourceWarehouseId, destinationWarehouseId } = dto;

    if (type === 'IN' && !destinationWarehouseId) {
      throw new BadRequestException('IN transactions require destinationWarehouseId');
    }

    if (type === 'OUT' && !sourceWarehouseId) {
      throw new BadRequestException('OUT transactions require sourceWarehouseId');
    }

    if (type === 'TRANSFER' && (!sourceWarehouseId || !destinationWarehouseId)) {
      throw new BadRequestException('TRANSFER transactions require both sourceWarehouseId and destinationWarehouseId');
    }
  }

  private async validateItems(items: TransactionItemDto[]) {
    const ids = items.map((i) => i.inventoryItemId);
    const found = await this.prisma.tenant().inventoryItem.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });

    if (found.length !== ids.length) {
      const foundIds = new Set(found.map((f) => f.id));
      const missingId = ids.find((id) => !foundIds.has(id));
      throw new NotFoundException(`Inventory item with ID ${missingId} not found`);
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
        newQuantity -= item.quantity;
      }
      // TRANSFER doesn't change total quantity, just location

      // Determine new status based on quantity and assignment
      let newStatus = 'IN_STOCK';
      if (newQuantity <= 0) {
        newStatus = 'OUT_OF_STOCK';
        newQuantity = Math.max(0, newQuantity); // Don't allow negative
      } else if (currentItem.itemType === 'UNIQUE' && currentItem.assignedToUserId) {
        newStatus = 'IN_USE';
      } else if (newQuantity <= currentItem.minQuantity) {
        newStatus = 'LOW_STOCK';
      }

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
