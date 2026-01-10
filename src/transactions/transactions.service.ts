import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto, TransactionType } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  async create(createTransactionDto: CreateTransactionDto) {
    const { items, ...transactionData } = createTransactionDto;

    // Validate transaction type requirements
    this.validateTransactionType(createTransactionDto);

    // Validate all items exist
    await this.validateItems(items);

    // Create transaction with items in a single transaction
    return this.prisma.$transaction(async (prisma) => {
      const transaction = await prisma.transaction.create({
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

      // Update inventory quantities based on transaction type
      await this.updateInventoryQuantities(transaction.id, items, transactionData.type as TransactionType);

      return transaction;
    });
  }

  async findAll() {
    return this.prisma.transaction.findMany({
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

  private async updateInventoryQuantities(
    transactionId: string,
    items: any[],
    type: TransactionType,
  ) {
    for (const item of items) {
      const currentItem = await this.prisma.inventoryItem.findUnique({
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

      await this.prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: {
          quantity: newQuantity,
        },
      });
    }
  }
}
