import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { IsStrongPassword } from '../decorators/strong-password.decorator';
import { normalizeEmail } from '../../common/decorators';

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsStrongPassword()
  password: string;

  @IsString()
  @IsOptional()
  name?: string;
}
