import { CreateTransactionDto } from './create-transaction.dto';
declare const UpdateTransactionDto_base: import("@nestjs/mapped-types").MappedType<Partial<Omit<CreateTransactionDto, "items" | "type" | "userId">>>;
export declare class UpdateTransactionDto extends UpdateTransactionDto_base {
}
export {};
