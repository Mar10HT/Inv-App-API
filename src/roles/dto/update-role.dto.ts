import { IsString, IsOptional, IsArray, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateRoleDto {
  /** Editable even for isSystem roles. */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  description?: string;

  /** Full replacement of assigned permissions. */
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(30, { each: true }) // CUIDs are 25 chars
  @IsOptional()
  permissionIds?: string[];
}
