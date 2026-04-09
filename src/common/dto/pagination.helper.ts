import { PaginationDto, PaginatedResult } from './pagination.dto';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

/**
 * Normalizes optional PaginationDto fields into concrete page/limit/skip values.
 * Centralizes the `|| 1` / `|| 10` defaults used across all list endpoints.
 */
export function parsePagination(pagination?: PaginationDto): PaginationParams {
  const page = Math.max(1, pagination?.page ?? 1);
  const limit = Math.min(100, Math.max(1, pagination?.limit ?? 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Normalizes an optional sortOrder string to a valid Prisma order direction.
 * Accepts only 'asc'; everything else (including arbitrary strings or undefined) falls back to 'desc'.
 */
export function parseSortOrder(value?: string): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

/**
 * Builds the `meta` block for a paginated API response.
 * All list endpoints return the same shape — this eliminates the repeated
 * `Math.ceil(total / limit)` and `hasNextPage`/`hasPrevPage` calculations.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginatedResult<never>['meta'] {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
