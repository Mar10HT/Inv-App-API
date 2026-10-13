/**
 * Normalizes an @IsDateString value ("2027-06-30" or a full ISO string) to the
 * full ISO-8601 datetime Prisma requires for DateTime columns.
 */
export function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}
