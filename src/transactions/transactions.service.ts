import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto, TransactionType } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaginationDto, PaginatedResult } from '../common/dto';
import { EventsService } from '../events/events.service';

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
      await this.updateInventoryQuantitiesInTx(tx, items, transactionData.type as TransactionType);

      return newTransaction;
    });

    this.eventsService.emitTransactionChange('created', result.id);
    this.eventsService.emitInventoryChange('updated');

    return result;
  }

  async findAll(pagination?: PaginationDto): Promise<PaginatedResult<any>> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        skip,
        take: limit,
        orderBy: {
          date: pagination?.sortOrder || 'desc',
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
      }),
      this.prisma.transaction.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async findRecent(limit: number = 10) {
    return this.prisma.transaction.findMany({
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
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Transaction with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      // Note: This will cascade delete transaction items
      await this.prisma.transaction.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
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

  private async validateItems(items: any[]) {
    for (const item of items) {
      const exists = await this.prisma.inventoryItem.findUnique({
        where: { id: item.inventoryItemId },
      });

      if (!exists) {
        throw new NotFoundException(`Inventory item with ID ${item.inventoryItemId} not found`);
      }
    }
  }

  private async updateInventoryQuantitiesInTx(
    tx: any,
    items: any[],
    type: TransactionType,
  ) {
    for (const item of items) {
      const currentItem = await tx.inventoryItem.findUnique({
        where: { id: item.inventoryItemId },
      });

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
