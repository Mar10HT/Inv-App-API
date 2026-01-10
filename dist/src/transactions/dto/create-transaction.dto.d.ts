export declare enum TransactionType {
    IN = "IN",
    OUT = "OUT",
    TRANSFER = "TRANSFER"
}
export declare class TransactionItemDto {
    inventoryItemId: string;
    quantity: number;
    notes?: string;
}
export declare class CreateTransactionDto {
    type: TransactionType;
    sourceWarehouseId?: string;
    destinationWarehouseId?: string;
    userId: string;
    date: string;
    notes?: string;
    items: TransactionItemDto[];
}
