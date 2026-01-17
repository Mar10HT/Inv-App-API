import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto } from './dto/update-loan.dto';
import { PaginationDto } from '../common/dto';
export declare class LoansController {
    private readonly loansService;
    constructor(loansService: LoansService);
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
    findAll(pagination: PaginationDto): Promise<import("../common/dto").PaginatedResult<any>>;
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
    getStats(): Promise<{
        totalActive: number;
        totalOverdue: number;
        totalReturned: number;
        dueSoon: number;
    }>;
    findByItem(itemId: string): Promise<({
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
    isItemOnLoan(itemId: string): Promise<{
        onLoan: boolean;
    }>;
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
    returnLoan(id: string, returnLoanDto: ReturnLoanDto): Promise<{
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
    checkOverdueLoans(): Promise<{
        message: string;
    }>;
}
