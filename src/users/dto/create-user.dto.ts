import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsEnum,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsString()
  @IsOptional()
  name?: string;

  /** RBAC role reference. Takes precedence over the legacy `role` enum when provided. */
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  roleId?: string;

  /**
   * @deprecated Kept for backwards compatibility during migration.
   * Use `roleId` (pointing to a Role record) instead.
   */
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;
}
