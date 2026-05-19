import { IsOptional, IsString } from 'class-validator';

export class CancelOutflowDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
