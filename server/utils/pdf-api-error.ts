import { isError } from 'h3'
import type { H3Event } from 'h3'
import { isPdfUpstreamFailureMessage, pdfUpstreamUnavailableMessage } from '../../shared/pdf-render'
import { apiError, type ApiErrorCode } from './api-error'

/** Map PDF render failures to a consistent API error for preview/generate endpoints. */
export function throwPdfRenderApiError(event: H3Event, err: unknown, fallbackMessage = 'PDF preview failed'): never {
  if (isError(err)) throw err

  const message = err instanceof Error ? err.message : fallbackMessage
  const code: ApiErrorCode = isPdfUpstreamFailureMessage(message) ? 'UPSTREAM_ERROR' : 'INTERNAL_ERROR'
  const friendly = code === 'UPSTREAM_ERROR' ? pdfUpstreamUnavailableMessage(message) : message
  throw apiError(event, code, friendly)
}
