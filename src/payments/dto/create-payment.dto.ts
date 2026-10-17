import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsPositive,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  // Exactly one of saleId/purchaseInvoiceId is required — validated in
  // PaymentsService, not here (same precedent as the BULK/UNIQUE
  // discriminator on CreatePurchaseInvoiceDto: a plain guard clause, no
  // DB-level XOR constraint exists in this codebase's db-push flow).
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  saleId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  purchaseInvoiceId?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
