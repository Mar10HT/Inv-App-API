import { IsStrongPassword } from '../../auth/decorators/strong-password.decorator';

/**
 * Payload for an admin directly setting another user's password.
 * Reuses the shared strong-password policy (12+ chars, mixed case, digit, symbol).
 */
export class AdminSetPasswordDto {
  @IsStrongPassword()
  newPassword: string;
}
