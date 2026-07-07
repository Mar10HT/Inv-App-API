import { TransformFnParams } from 'class-transformer';

/**
 * `class-transformer` @Transform callback that lowercases and trims an email-like
 * field so lookups/storage are case-insensitive. `TransformFnParams.value` is typed
 * `any` by the library, so this narrows it to the type these DTO fields actually
 * declare (`string`, optionally absent) instead of leaving it as `any`.
 *
 * @example
 * @Transform(normalizeEmail)
 * @IsEmail()
 * email: string;
 */
export function normalizeEmail({
  value,
}: Omit<TransformFnParams, 'value'> & {
  value: string | undefined;
}): string | undefined {
  return value?.toLowerCase().trim();
}
