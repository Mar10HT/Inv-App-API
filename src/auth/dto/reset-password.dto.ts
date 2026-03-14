import { IsStrongPassword } from '../decorators/strong-password.decorator';

export class ResetPasswordDto {
  @IsStrongPassword()
  newPassword: string;
}
