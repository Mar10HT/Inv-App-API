import { IsString, IsNotEmpty, IsOptional, IsArray, MaxLength, ArrayMaxSize, ArrayMinSize } from 'class-validator';

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
  @IsNotEmpty({ each: true })
  @MaxLength(30, { each: true }) // CUIDs are 25 chars
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsOptional()
  permissionIds?: string[];
}
