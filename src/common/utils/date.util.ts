/**
 * Normalizes an @IsDateString value ("2027-06-30" or a full ISO string) to the
 * full ISO-8601 datetime Prisma requires for DateTime columns.
 */
export function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

// Honduras has no daylight saving time, so its offset is fixed.
const BUSINESS_UTC_OFFSET = '-06:00';

/**
 * Like toIsoDateTime, but a bare date ("2027-06-30") means the end of that
 * day in Honduras, so something that expires "on the 30th" is still valid
 * all of the 30th. A full ISO string is kept as the exact instant it names.
 */
export function toEndOfBusinessDay(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T23:59:59.999${BUSINESS_UTC_OFFSET}`).toISOString()
    : toIsoDateTime(value);
}
