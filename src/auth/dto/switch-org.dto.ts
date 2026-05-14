import { IsString, IsNotEmpty } from 'class-validator';

export class SwitchOrgDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;
}
