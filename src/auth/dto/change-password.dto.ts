import { IsString, IsNotEmpty } from 'class-validator';
import { IsStrongPassword } from '../decorators/strong-password.decorator';

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsStrongPassword()
  newPassword: string;
}
