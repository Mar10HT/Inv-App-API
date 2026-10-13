/**
 * Machine-readable error payload for user-facing 4xx responses.
 *
 * Pass the result to an HttpException subclass, e.g.
 * `throw new BadRequestException(apiError('INSUFFICIENT_STOCK', msg, { item }))`.
 *
 * - `code` is a stable UPPER_SNAKE_CASE identifier the frontend maps to a
 *   translation key (`API_ERRORS.<code>`).
 * - `message` stays in English: it is the fallback text for clients that do
 *   not know the code, and what shows up in logs.
 * - `params` carries the dynamic parts of the message so translations can
 *   interpolate them.
 */
export type ApiErrorParams = Record<string, string | number>;

export interface ApiErrorBody {
  message: string;
  code: string;
  params?: ApiErrorParams;
}

export function apiError(
  code: string,
  message: string,
  params?: ApiErrorParams,
): ApiErrorBody {
  return params ? { message, code, params } : { message, code };
}
