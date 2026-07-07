import { createError } from 'h3'
import type { H3Event } from 'h3'
import type { ZodError } from 'zod'

/** Standard API error codes (SPEC §14). */
export const API_ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EDIT_SESSION_ACTIVE: 423,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS

export interface ApiErrorBody {
  code: ApiErrorCode
  message: string
  details: Record<string, unknown>
  requestId: string
}

export function buildApiErrorBody(
  code: ApiErrorCode,
  message: string,
  details: Record<string, unknown> = {},
  requestId = '',
): ApiErrorBody {
  return { code, message, details, requestId }
}

/**
 * Create an H3 error carrying the standard `{ code, message, details, requestId }`
 * body. Throw the result from any API handler.
 */
export function apiError(
  event: H3Event | null,
  code: ApiErrorCode,
  message: string,
  details: Record<string, unknown> = {},
) {
  const requestId = (event?.context?.requestId as string | undefined) ?? ''
  return createError({
    statusCode: API_ERROR_STATUS[code],
    statusMessage: code,
    message,
    data: buildApiErrorBody(code, message, details, requestId),
  })
}

/** Convert a ZodError into a VALIDATION_ERROR with per-field issues. */
export function validationError(event: H3Event | null, error: ZodError) {
  const issues = error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }))
  return apiError(event, 'VALIDATION_ERROR', 'Request validation failed', { issues })
}
