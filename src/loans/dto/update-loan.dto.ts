import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';

export enum LoanStatus {
  ACTIVE = 'ACTIVE',
  OVERDUE = 'OVERDUE',
  RETURNED = 'RETURNED',
}

export class UpdateLoanDto {
  @IsEnum(LoanStatus)
  @IsOptional()
  status?: LoanStatus;

  @IsDateString()
  @IsOptional()
  returnDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ReturnLoanDto {
  @IsDateString()
  @IsOptional()
  returnDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
