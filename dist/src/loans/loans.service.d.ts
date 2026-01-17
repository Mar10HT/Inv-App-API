import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto } from './dto/update-loan.dto';
import { PaginationDto, PaginatedResult } from '../common/dto';
export declare class LoansService {
    private prisma;
    constructor(prisma: PrismaService);
    private readonly loanInclude;
    create(createLoanDto: CreateLoanDto): Promise<{
        createdBy: {
            id: string;
            email: string;
            name: string | null;
        };
        inventoryItem: {
            id: string;
            name: string;
            quantity: number;
            serviceTag: string | null;
        };
        sourceWarehouse: {
            id: string;
            name: string;
            location: string;
        };
        destinationWarehouse: {
            id: string;
            name: string;
            location: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        quantity: number;
        status: import("@prisma/client").$Enums.LoanStatus;
        createdById: string;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        notes: string | null;
        inventoryItemId: string;
        loanDate: Date;
        dueDate: Date;
        returnDate: Date | null;
    }>;
    findAll(pagination?: PaginationDto): Promise<PaginatedResult<any>>;
    findActive(): Promise<({
        createdBy: {
            id: string;
            email: string;
            name: string | null;
        };
        inventoryItem: {
            id: string;
            name: string;
            quantity: number;
            serviceTag: string | null;
        };
        sourceWarehouse: {
            id: string;
            name: string;
            location: string;
        };
        destinationWarehouse: {
            id: string;
            name: string;
            location: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        quantity: number;
        status: import("@prisma/client").$Enums.LoanStatus;
        createdById: string;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        notes: string | null;
        inventoryItemId: string;
        loanDate: Date;
        dueDate: Date;
        returnDate: Date | null;
    })[]>;
    findOne(id: string): Promise<{
        createdBy: {
            id: string;
            email: string;
            name: string | null;
        };
        inventoryItem: {
            id: string;
            name: string;
            quantity: number;
            serviceTag: string | null;
        };
        sourceWarehouse: {
            id: string;
            name: string;
            location: string;
        };
        destinationWarehouse: {
            id: string;
            name: string;
            location: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        quantity: number;
        status: import("@prisma/client").$Enums.LoanStatus;
        createdById: string;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        notes: string | null;
        inventoryItemId: string;
        loanDate: Date;
        dueDate: Date;
        returnDate: Date | null;
    }>;
    findByItem(inventoryItemId: string): Promise<({
        createdBy: {
            id: string;
            email: string;
            name: string | null;
        };
        inventoryItem: {
            id: string;
            name: string;
            quantity: number;
            serviceTag: string | null;
        };
        sourceWarehouse: {
            id: string;
            name: string;
            location: string;
        };
        destinationWarehouse: {
            id: string;
            name: string;
            location: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        quantity: number;
        status: import("@prisma/client").$Enums.LoanStatus;
        createdById: string;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        notes: string | null;
        inventoryItemId: string;
        loanDate: Date;
        dueDate: Date;
        returnDate: Date | null;
    })[]>;
    findByWarehouse(warehouseId: string): Promise<({
        createdBy: {
            id: string;
            email: string;
            name: string | null;
        };
        inventoryItem: {
            id: string;
            name: string;
            quantity: number;
            serviceTag: string | null;
        };
        sourceWarehouse: {
            id: string;
            name: string;
            location: string;
        };
        destinationWarehouse: {
            id: string;
            name: string;
            location: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        quantity: number;
        status: import("@prisma/client").$Enums.LoanStatus;
        createdById: string;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        notes: string | null;
        inventoryItemId: string;
        loanDate: Date;
        dueDate: Date;
        returnDate: Date | null;
    })[]>;
    update(id: string, updateLoanDto: UpdateLoanDto): Promise<{
        createdBy: {
            id: string;
            email: string;
            name: string | null;
        };
        inventoryItem: {
            id: string;
            name: string;
            quantity: number;
            serviceTag: string | null;
        };
        sourceWarehouse: {
            id: string;
            name: string;
            location: string;
        };
        destinationWarehouse: {
            id: string;
            name: string;
            location: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        quantity: number;
        status: import("@prisma/client").$Enums.LoanStatus;
        createdById: string;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        notes: string | null;
        inventoryItemId: string;
        loanDate: Date;
        dueDate: Date;
        returnDate: Date | null;
    }>;
    returnLoan(id: string, returnLoanDto?: ReturnLoanDto): Promise<{
        createdBy: {
            id: string;
            email: string;
            name: string | null;
        };
        inventoryItem: {
            id: string;
            name: string;
            quantity: number;
            serviceTag: string | null;
        };
        sourceWarehouse: {
            id: string;
            name: string;
            location: string;
        };
        destinationWarehouse: {
            id: string;
            name: string;
            location: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        quantity: number;
        status: import("@prisma/client").$Enums.LoanStatus;
        createdById: string;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        notes: string | null;
        inventoryItemId: string;
        loanDate: Date;
        dueDate: Date;
        returnDate: Date | null;
    }>;
    remove(id: string): Promise<void>;
    getStats(): Promise<{
        totalActive: number;
        totalOverdue: number;
        totalReturned: number;
        dueSoon: number;
    }>;
    isItemOnLoan(inventoryItemId: string): Promise<boolean>;
    checkOverdueLoans(): Promise<void>;
}
