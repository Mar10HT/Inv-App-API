import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto } from './dto/update-loan.dto';
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
        inventoryItemId: string;
        notes: string | null;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        dueDate: Date;
        returnDate: Date | null;
        loanDate: Date;
    }>;
    findAll(): Promise<({
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
        inventoryItemId: string;
        notes: string | null;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        dueDate: Date;
        returnDate: Date | null;
        loanDate: Date;
    })[]>;
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
        inventoryItemId: string;
        notes: string | null;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        dueDate: Date;
        returnDate: Date | null;
        loanDate: Date;
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
        inventoryItemId: string;
        notes: string | null;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        dueDate: Date;
        returnDate: Date | null;
        loanDate: Date;
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
        inventoryItemId: string;
        notes: string | null;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        dueDate: Date;
        returnDate: Date | null;
        loanDate: Date;
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
        inventoryItemId: string;
        notes: string | null;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        dueDate: Date;
        returnDate: Date | null;
        loanDate: Date;
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
        inventoryItemId: string;
        notes: string | null;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        dueDate: Date;
        returnDate: Date | null;
        loanDate: Date;
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
        inventoryItemId: string;
        notes: string | null;
        sourceWarehouseId: string;
        destinationWarehouseId: string;
        dueDate: Date;
        returnDate: Date | null;
        loanDate: Date;
    }>;
    remove(id: string): Promise<void>;
    checkOverdueLoans(): Promise<{
        message: string;
    }>;
}
