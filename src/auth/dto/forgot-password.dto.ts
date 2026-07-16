import { IsEmail, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeEmail } from '../../common/decorators';

export class ForgotPasswordDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
