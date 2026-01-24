import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto, LoanStatus } from './dto/update-loan.dto';
import { PaginationDto, PaginatedResult } from '../common/dto';

@Injectable()
export class LoansService {
  constructor(private prisma: PrismaService) {}

  private readonly loanInclude = {
    inventoryItem: {
      select: {
        id: true,
        name: true,
        serviceTag: true,
        quantity: true,
      },
    },
    sourceWarehouse: {
      select: {
        id: true,
        name: true,
        location: true,
      },
    },
    destinationWarehouse: {
      select: {
        id: true,
        name: true,
        location: true,
      },
    },
    createdBy: {
      select: {
        id: true,
        email: true,
        name: true,
      },
    },
  };

  async create(createLoanDto: CreateLoanDto, userId: string) {
    // Validate warehouses are different
    if (createLoanDto.sourceWarehouseId === createLoanDto.destinationWarehouseId) {
      throw new BadRequestException(
        'Source and destination warehouses must be different',
      );
    }

    // Validate item exists and belongs to source warehouse
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id: createLoanDto.inventoryItemId },
    });

    if (!item) {
      throw new NotFoundException(
        `Inventory item with ID ${createLoanDto.inventoryItemId} not found`,
      );
    }

    if (item.warehouseId !== createLoanDto.sourceWarehouseId) {
      throw new BadRequestException(
        'Item does not belong to the source warehouse',
      );
    }

    // Check if item is already on loan
    const existingLoan = await this.prisma.loan.findFirst({
      where: {
        inventoryItemId: createLoanDto.inventoryItemId,
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
    });

    if (existingLoan) {
      throw new BadRequestException('Item is already on loan');
    }

    // Validate warehouses exist
    const sourceWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: createLoanDto.sourceWarehouseId },
    });
    const destinationWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: createLoanDto.destinationWarehouseId },
    });

    if (!sourceWarehouse || !destinationWarehouse) {
      throw new NotFoundException('Invalid warehouse');
    }

    // Create the loan
    return this.prisma.loan.create({
      data: {
        inventoryItemId: createLoanDto.inventoryItemId,
        quantity: createLoanDto.quantity,
        sourceWarehouseId: createLoanDto.sourceWarehouseId,
        destinationWarehouseId: createLoanDto.destinationWarehouseId,
        dueDate: new Date(createLoanDto.dueDate),
        createdById: userId,
        notes: createLoanDto.notes,
      },
      include: this.loanInclude,
    });
  }

  async findAll(pagination?: PaginationDto): Promise<PaginatedResult<any>> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.loan.findMany({
        skip,
        take: limit,
        orderBy: { loanDate: pagination?.sortOrder || 'desc' },
        include: this.loanInclude,
      }),
      this.prisma.loan.count(),
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

  async findActive() {
    return this.prisma.loan.findMany({
      where: {
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
      orderBy: { loanDate: 'desc' },
      include: this.loanInclude,
    });
  }

  async findOne(id: string) {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: this.loanInclude,
    });

    if (!loan) {
      throw new NotFoundException(`Loan with ID ${id} not found`);
    }

    return loan;
  }

  async findByItem(inventoryItemId: string) {
    return this.prisma.loan.findMany({
      where: { inventoryItemId },
      orderBy: { loanDate: 'desc' },
      include: this.loanInclude,
    });
  }

  async findByWarehouse(warehouseId: string) {
    return this.prisma.loan.findMany({
      where: {
        OR: [
          { sourceWarehouseId: warehouseId },
          { destinationWarehouseId: warehouseId },
        ],
      },
      orderBy: { loanDate: 'desc' },
      include: this.loanInclude,
    });
  }

  async update(id: string, updateLoanDto: UpdateLoanDto) {
    try {
      return await this.prisma.loan.update({
        where: { id },
        data: {
          ...updateLoanDto,
          returnDate: updateLoanDto.returnDate
            ? new Date(updateLoanDto.returnDate)
            : undefined,
        },
        include: this.loanInclude,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Loan with ID ${id} not found`);
      }
      throw error;
    }
  }

  async returnLoan(id: string, returnLoanDto?: ReturnLoanDto) {
    const loan = await this.findOne(id);

    if (loan.status === 'RETURNED') {
      throw new BadRequestException('Loan is already returned');
    }

    const returnDate = returnLoanDto?.returnDate
      ? new Date(returnLoanDto.returnDate)
      : new Date();

    let notes = loan.notes || '';
    if (returnLoanDto?.notes) {
      notes = notes ? `${notes}\n${returnLoanDto.notes}` : returnLoanDto.notes;
    }

    return this.prisma.loan.update({
      where: { id },
      data: {
        status: 'RETURNED',
        returnDate,
        notes: notes || undefined,
      },
      include: this.loanInclude,
    });
  }

  async remove(id: string) {
    try {
      await this.prisma.loan.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Loan with ID ${id} not found`);
      }
      throw error;
    }
  }

  async getStats() {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [totalActive, totalOverdue, totalReturned, dueSoon] =
      await Promise.all([
        this.prisma.loan.count({ where: { status: 'ACTIVE' } }),
        this.prisma.loan.count({ where: { status: 'OVERDUE' } }),
        this.prisma.loan.count({ where: { status: 'RETURNED' } }),
        this.prisma.loan.count({
          where: {
            status: 'ACTIVE',
            dueDate: {
              lte: sevenDaysFromNow,
              gt: now,
            },
          },
        }),
      ]);

    return {
      totalActive,
      totalOverdue,
      totalReturned,
      dueSoon,
    };
  }

  async isItemOnLoan(inventoryItemId: string): Promise<boolean> {
    const activeLoan = await this.prisma.loan.findFirst({
      where: {
        inventoryItemId,
        status: { in: ['ACTIVE', 'OVERDUE'] },
      },
    });
    return !!activeLoan;
  }

  // Check and update overdue loans - called on demand
  async checkOverdueLoans() {
    const now = new Date();

    await this.prisma.loan.updateMany({
      where: {
        status: 'ACTIVE',
        dueDate: { lt: now },
      },
      data: {
        status: 'OVERDUE',
      },
    });
  }
}
