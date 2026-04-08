import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto, LoanStatus } from './dto/update-loan.dto';
import { PaginationDto, PaginatedResult, parsePagination, buildPaginationMeta } from '../common/dto';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';
import { warehouseFilterMultiField } from '../common/warehouse-access/warehouse-filter.util';

@Injectable()
export class LoansService {
  constructor(
    private prisma: PrismaService,
    private qrService: QrService,
    private eventsService: EventsService,
    private auditService: AuditService,
  ) {}

  // Light include for list queries (faster)
  private readonly loanIncludeLight = {
    inventoryItem: {
      select: {
        id: true,
        name: true,
        serviceTag: true,
      },
    },
    sourceWarehouse: {
      select: {
        id: true,
        name: true,
      },
    },
    destinationWarehouse: {
      select: {
        id: true,
        name: true,
      },
    },
    createdBy: {
      select: {
        id: true,
        name: true,
      },
    },
  };

  // Full include for detail queries
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
    receivedBy: {
      select: {
        id: true,
        email: true,
        name: true,
      },
    },
    returnConfirmedBy: {
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
      throw new NotFoundException('Inventory item not found');
    }

    if (item.warehouseId !== createLoanDto.sourceWarehouseId) {
      throw new BadRequestException(
        'Item does not belong to the source warehouse',
      );
    }

    // Check if item is already on loan (any active status)
    const existingLoan = await this.prisma.loan.findFirst({
      where: {
        inventoryItemId: createLoanDto.inventoryItemId,
        status: { in: ['PENDING', 'SENT', 'RECEIVED', 'RETURN_PENDING', 'OVERDUE'] },
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

    // Create the loan with PENDING status
    const loan = await this.prisma.loan.create({
      data: {
        inventoryItemId: createLoanDto.inventoryItemId,
        quantity: createLoanDto.quantity,
        sourceWarehouseId: createLoanDto.sourceWarehouseId,
        destinationWarehouseId: createLoanDto.destinationWarehouseId,
        dueDate: new Date(createLoanDto.dueDate),
        createdById: userId,
        notes: createLoanDto.notes,
        status: 'PENDING',
      },
      include: this.loanInclude,
    });

    this.eventsService.emitLoanChange('created', loan.id);

    return loan;
  }

  /**
   * Mark loan as sent and generate QR code for receipt confirmation
   */
  async sendLoan(id: string, userWarehouseIds?: string[] | null) {
    const loan = await this.findOne(id);

    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(loan.sourceWarehouse.id) ||
        userWarehouseIds.includes(loan.destinationWarehouse.id);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to the involved warehouses');
      }
    }

    if (loan.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot send loan in ${loan.status} status. Only PENDING loans can be sent.`,
      );
    }

    // Generate unique QR code for send confirmation
    const sendQrCode = this.qrService.generateCode();

    const updatedLoan = await this.prisma.loan.update({
      where: { id },
      data: {
        status: 'SENT',
        sendQrCode,
      },
      include: this.loanInclude,
    });

    // Generate QR code image
    const qrData = {
      type: 'LOAN_SEND' as const,
      id: loan.id,
      code: sendQrCode,
    };
    const qrDataUrl = await this.qrService.generateQrDataUrl(qrData);

    return {
      ...updatedLoan,
      qrCodeDataUrl: qrDataUrl,
    };
  }

  /**
   * Confirm receipt of loan by scanning QR code
   */
  async confirmReceipt(qrCode: string, userId: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { sendQrCode: qrCode },
      include: this.loanInclude,
    });

    if (!loan) {
      throw new NotFoundException('Invalid QR code or loan not found');
    }

    // Status check + write in one transaction to prevent double-confirmation under concurrency
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.loan.findUnique({ where: { id: loan.id } });
      if (!current || current.status !== 'SENT') {
        throw new BadRequestException(
          `Cannot confirm receipt. Loan is in ${current?.status ?? 'unknown'} status.`,
        );
      }
      return tx.loan.update({
        where: { id: loan.id },
        data: { status: 'RECEIVED', receivedAt: new Date(), receivedById: userId },
        include: this.loanInclude,
      });
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Loan',
      entityId: loan.id,
      userId,
      changes: { status: 'RECEIVED', confirmedViaQr: true },
    });

    return updated;
  }

  /**
   * Initiate return and generate QR code for return confirmation
   */
  async initiateReturn(id: string, userWarehouseIds?: string[] | null) {
    const loan = await this.findOne(id);

    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(loan.sourceWarehouse.id) ||
        userWarehouseIds.includes(loan.destinationWarehouse.id);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to the involved warehouses');
      }
    }

    // Allow ACTIVE for backwards compatibility with legacy loans
    const allowedStatuses = ['RECEIVED', 'OVERDUE', 'ACTIVE'];
    if (!allowedStatuses.includes(loan.status)) {
      throw new BadRequestException(
        `Cannot initiate return. Loan is in ${loan.status} status. Only RECEIVED, OVERDUE or ACTIVE loans can be returned.`,
      );
    }

    // Generate unique QR code for return confirmation
    const returnQrCode = this.qrService.generateCode();

    const updatedLoan = await this.prisma.loan.update({
      where: { id },
      data: {
        status: 'RETURN_PENDING',
        returnQrCode,
      },
      include: this.loanInclude,
    });

    // Generate QR code image
    const qrData = {
      type: 'LOAN_RETURN' as const,
      id: loan.id,
      code: returnQrCode,
    };
    const qrDataUrl = await this.qrService.generateQrDataUrl(qrData);

    return {
      ...updatedLoan,
      qrCodeDataUrl: qrDataUrl,
    };
  }

  /**
   * Confirm return of loan by scanning QR code
   */
  async confirmReturn(qrCode: string, userId: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { returnQrCode: qrCode },
      include: this.loanInclude,
    });

    if (!loan) {
      throw new NotFoundException('Invalid QR code or loan not found');
    }

    // Status check + write in one transaction to prevent double-confirmation under concurrency
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.loan.findUnique({ where: { id: loan.id } });
      if (!current || current.status !== 'RETURN_PENDING') {
        throw new BadRequestException(
          `Cannot confirm return. Loan is in ${current?.status ?? 'unknown'} status.`,
        );
      }
      return tx.loan.update({
        where: { id: loan.id },
        data: {
          status: 'RETURNED',
          returnDate: new Date(),
          returnConfirmedAt: new Date(),
          returnConfirmedById: userId,
        },
        include: this.loanInclude,
      });
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Loan',
      entityId: loan.id,
      userId,
      changes: { status: 'RETURNED', confirmedViaQr: true },
    });

    return updated;
  }

  /**
   * Get QR code image for a loan (send or return)
   */
  async getQrCode(id: string, type: 'send' | 'return') {
    if (type !== 'send' && type !== 'return') {
      throw new BadRequestException(`Invalid QR code type: ${type}. Must be 'send' or 'return'.`);
    }

    const loan = await this.findOne(id);

    if (type === 'send') {
      if (!loan.sendQrCode) {
        throw new BadRequestException('Send QR code not generated. Send the loan first.');
      }
      const qrData = {
        type: 'LOAN_SEND' as const,
        id: loan.id,
        code: loan.sendQrCode,
      };
      return this.qrService.generateQrDataUrl(qrData);
    } else {
      if (!loan.returnQrCode) {
        throw new BadRequestException('Return QR code not generated. Initiate return first.');
      }
      const qrData = {
        type: 'LOAN_RETURN' as const,
        id: loan.id,
        code: loan.returnQrCode,
      };
      return this.qrService.generateQrDataUrl(qrData);
    }
  }

  /**
   * Scan and process QR code (auto-detect type)
   */
  async processQrCode(scannedData: string, userId: string) {
    const qrData = this.qrService.parseQrData(scannedData);

    if (!qrData) {
      throw new BadRequestException('Invalid QR code format');
    }

    if (qrData.type === 'LOAN_SEND') {
      return this.confirmReceipt(qrData.code, userId);
    } else if (qrData.type === 'LOAN_RETURN') {
      return this.confirmReturn(qrData.code, userId);
    } else {
      throw new BadRequestException('Unknown QR code type');
    }
  }

  // ==================== Manual Confirmation (No QR) ====================

  /**
   * Manually confirm receipt of a loan without QR code.
   * Accepts SENT or OVERDUE (only if not yet received) status.
   * Performs warehouse access check before the transaction, then re-validates
   * status inside the transaction to prevent double-confirmation under concurrency.
   */
  async manualConfirmReceipt(id: string, userId: string, userWarehouseIds: string[] | null) {
    const loan = await this.findOne(id);

    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(loan.sourceWarehouse.id) ||
        userWarehouseIds.includes(loan.destinationWarehouse.id);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to the involved warehouses');
      }
    }

    let previousStatus = 'unknown';

    // Status check + write in one transaction to prevent double-confirmation under concurrency
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.loan.findUnique({ where: { id } });
      if (!current || (current.status !== 'SENT' && current.status !== 'OVERDUE')) {
        throw new BadRequestException(
          `Cannot confirm receipt. Loan is in ${current?.status ?? 'unknown'} status. Only SENT or OVERDUE loans can be confirmed.`,
        );
      }
      // Guard: OVERDUE from RECEIVED — prevent overwriting existing receipt data
      if (current.status === 'OVERDUE' && current.receivedAt) {
        throw new BadRequestException(
          'This loan was already received. Use manual confirm return to confirm the return instead.',
        );
      }
      previousStatus = current.status;
      return tx.loan.update({
        where: { id },
        data: { status: 'RECEIVED', receivedAt: new Date(), receivedById: userId },
        include: this.loanInclude,
      });
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Loan',
      entityId: id,
      userId,
      changes: { status: 'RECEIVED', confirmedManually: true, previousStatus },
    });

    return updated;
  }

  /**
   * Manually confirm return of a loan without QR code.
   * Accepts RETURN_PENDING or OVERDUE (only if already received) status.
   * Performs warehouse access check before the transaction, then re-validates
   * status inside the transaction to prevent double-confirmation under concurrency.
   */
  async manualConfirmReturn(id: string, userId: string, userWarehouseIds: string[] | null) {
    const loan = await this.findOne(id);

    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(loan.sourceWarehouse.id) ||
        userWarehouseIds.includes(loan.destinationWarehouse.id);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to the involved warehouses');
      }
    }

    let previousStatus = 'unknown';

    // Status check + write in one transaction to prevent double-confirmation under concurrency
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.loan.findUnique({ where: { id } });
      if (!current || (current.status !== 'RETURN_PENDING' && current.status !== 'OVERDUE')) {
        throw new BadRequestException(
          `Cannot confirm return. Loan is in ${current?.status ?? 'unknown'} status. Only RETURN_PENDING or OVERDUE loans can be confirmed.`,
        );
      }
      // Guard: OVERDUE from SENT (never received) — prevent confirming return without receipt
      if (current.status === 'OVERDUE' && !current.receivedAt) {
        throw new BadRequestException(
          'This loan was never received. Use manual confirm receipt first.',
        );
      }
      previousStatus = current.status;
      return tx.loan.update({
        where: { id },
        data: {
          status: 'RETURNED',
          returnDate: new Date(),
          returnConfirmedAt: new Date(),
          returnConfirmedById: userId,
        },
        include: this.loanInclude,
      });
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'Loan',
      entityId: id,
      userId,
      changes: { status: 'RETURNED', confirmedManually: true, previousStatus },
    });

    return updated;
  }

  async findAll(pagination?: PaginationDto, warehouseIds?: string[] | null, status?: string): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = parsePagination(pagination);

    const where = {
      ...warehouseFilterMultiField(warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']),
      ...(status ? { status: status as LoanStatus } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.loan.findMany({
        where,
        skip,
        take: limit,
        orderBy: { loanDate: pagination?.sortOrder || 'desc' },
        include: this.loanIncludeLight,
      }),
      this.prisma.loan.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findActive(warehouseIds?: string[] | null) {
    const wFilter = warehouseFilterMultiField(warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']);

    return this.prisma.loan.findMany({
      where: {
        status: { in: ['PENDING', 'SENT', 'RECEIVED', 'RETURN_PENDING', 'OVERDUE'] as LoanStatus[] },
        ...wFilter,
      },
      orderBy: { loanDate: 'desc' },
      include: this.loanIncludeLight,
    });
  }

  async findOne(id: string, userWarehouseIds?: string[] | null) {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: this.loanInclude,
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(loan.sourceWarehouseId) ||
        userWarehouseIds.includes(loan.destinationWarehouseId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this loan');
      }
    }

    return loan;
  }

  async findByItem(inventoryItemId: string, userWarehouseIds?: string[] | null) {
    const wFilter = warehouseFilterMultiField(userWarehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']);
    return this.prisma.loan.findMany({
      where: { inventoryItemId, ...wFilter },
      orderBy: { loanDate: 'desc' },
      include: this.loanIncludeLight,
    });
  }

  async findByWarehouse(warehouseId: string, userWarehouseIds?: string[] | null) {
    if (userWarehouseIds != null && !userWarehouseIds.includes(warehouseId)) {
      throw new ForbiddenException('You do not have access to this warehouse');
    }
    return this.prisma.loan.findMany({
      where: {
        OR: [
          { sourceWarehouseId: warehouseId },
          { destinationWarehouseId: warehouseId },
        ],
      },
      orderBy: { loanDate: 'desc' },
      include: this.loanIncludeLight,
    });
  }

  async update(id: string, updateLoanDto: UpdateLoanDto, userWarehouseIds?: string[] | null) {
    const loan = await this.findOne(id);
    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(loan.sourceWarehouseId) ||
        userWarehouseIds.includes(loan.destinationWarehouseId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this loan');
      }
    }
    try {
      // Explicitly omit status to prevent state machine bypass via the generic update endpoint
      const { status: _omitted, ...safeFields } = updateLoanDto;
      return await this.prisma.loan.update({
        where: { id },
        data: {
          ...safeFields,
          returnDate: safeFields.returnDate
            ? new Date(safeFields.returnDate)
            : undefined,
        },
        include: this.loanInclude,
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Loan not found');
      }
      throw error;
    }
  }

  /**
   * Legacy return method (without QR) - kept for backwards compatibility
   */
  async returnLoan(id: string, returnLoanDto?: ReturnLoanDto, userWarehouseIds?: string[] | null) {
    const loan = await this.findOne(id);
    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(loan.sourceWarehouseId) ||
        userWarehouseIds.includes(loan.destinationWarehouseId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this loan');
      }
    }

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

  async cancel(id: string, userWarehouseIds?: string[] | null) {
    const loan = await this.findOne(id);
    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(loan.sourceWarehouseId) ||
        userWarehouseIds.includes(loan.destinationWarehouseId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this loan');
      }
    }

    // Wrap status check and update in a single transaction to prevent TOCTOU races
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.loan.findUnique({ where: { id } });
      if (!current || current.status === 'RETURNED' || current.status === 'CANCELLED') {
        throw new BadRequestException(`Cannot cancel loan in ${current?.status ?? 'unknown'} status`);
      }
      return tx.loan.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: this.loanInclude,
      });
    });
  }

  async remove(id: string) {
    try {
      await this.prisma.loan.delete({
        where: { id },
      });
    } catch (error) {
      if (error.code === 'P2025') {
        throw new NotFoundException('Loan not found');
      }
      throw error;
    }
  }

  async getStats(warehouseIds?: string[] | null) {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const wFilter = warehouseFilterMultiField(warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']);

    const [totalPending, totalSent, totalReceived, totalReturnPending, totalReturned, totalOverdue, dueSoon] =
      await Promise.all([
        this.prisma.loan.count({ where: { status: 'PENDING', ...wFilter } }),
        this.prisma.loan.count({ where: { status: 'SENT', ...wFilter } }),
        this.prisma.loan.count({ where: { status: 'RECEIVED', ...wFilter } }),
        this.prisma.loan.count({ where: { status: 'RETURN_PENDING', ...wFilter } }),
        this.prisma.loan.count({ where: { status: 'RETURNED', ...wFilter } }),
        this.prisma.loan.count({ where: { status: 'OVERDUE', ...wFilter } }),
        this.prisma.loan.count({
          where: {
            status: { in: ['SENT', 'RECEIVED'] },
            dueDate: {
              lte: sevenDaysFromNow,
              gt: now,
            },
            ...wFilter,
          },
        }),
      ]);

    return {
      totalPending,
      totalSent,
      totalReceived,
      totalReturnPending,
      totalReturned,
      totalOverdue,
      dueSoon,
      // Legacy fields for backwards compatibility
      totalActive: totalPending + totalSent + totalReceived + totalReturnPending,
    };
  }

  async isItemOnLoan(inventoryItemId: string): Promise<boolean> {
    const activeLoan = await this.prisma.loan.findFirst({
      where: {
        inventoryItemId,
        status: { in: ['PENDING', 'SENT', 'RECEIVED', 'RETURN_PENDING', 'OVERDUE'] },
      },
    });
    return !!activeLoan;
  }

  // Check and update overdue loans - called on demand
  async checkOverdueLoans(userWarehouseIds?: string[] | null) {
    const now = new Date();
    const wFilter = warehouseFilterMultiField(userWarehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']);

    await this.prisma.loan.updateMany({
      where: {
        status: { in: ['SENT', 'RECEIVED'] },
        dueDate: { lt: now },
        ...wFilter,
      },
      data: {
        status: 'OVERDUE',
      },
    });
  }
}
