import { IsEnum, IsString, IsOptional, IsBoolean } from 'class-validator';
import { ReportType, ReportFrequency } from '@prisma/client';

export class CreateScheduledReportDto {
  @IsEnum(ReportType)
  reportType: ReportType;

  @IsEnum(ReportFrequency)
  frequency: ReportFrequency;

  @IsString()
  recipientEmails: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

export class UpdateScheduledReportDto {
  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  @IsOptional()
  @IsEnum(ReportFrequency)
  frequency?: ReportFrequency;

  @IsOptional()
  @IsString()
  recipientEmails?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
