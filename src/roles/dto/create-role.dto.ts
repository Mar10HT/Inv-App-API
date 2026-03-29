import { IsString, IsNotEmpty, IsOptional, IsArray, IsUUID, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  /** IDs of Permission records to assign to this role. */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissionIds?: string[];
}
