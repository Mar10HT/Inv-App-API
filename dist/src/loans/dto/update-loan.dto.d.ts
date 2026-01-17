export declare enum LoanStatus {
    ACTIVE = "ACTIVE",
    OVERDUE = "OVERDUE",
    RETURNED = "RETURNED"
}
export declare class UpdateLoanDto {
    status?: LoanStatus;
    returnDate?: string;
    notes?: string;
}
export declare class ReturnLoanDto {
    returnDate?: string;
    notes?: string;
}
