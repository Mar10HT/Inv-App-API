import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateTransactionDto } from './create-transaction.dto';

// Transactions should generally not be updated once created
// But we allow updating notes
export class UpdateTransactionDto extends PartialType(
  OmitType(CreateTransactionDto, ['items', 'type', 'userId'] as const),
) {}
