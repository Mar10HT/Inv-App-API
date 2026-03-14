import { applyDecorators } from '@nestjs/common';
import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

/**
 * Shared strong-password validator applied to register, reset, and change-password flows.
 * Rules: 12+ chars, uppercase, lowercase, digit, special char (@$!%*?&).
 */
export function IsStrongPassword() {
  return applyDecorators(
    IsString(),
    IsNotEmpty(),
    MinLength(12, { message: 'Password must be at least 12 characters long' }),
    Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
      message:
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)',
    }),
  );
}
