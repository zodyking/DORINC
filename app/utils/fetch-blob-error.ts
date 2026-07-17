type FetchErrorShape = {
  statusCode?: number
  status?: number
  statusMessage?: string
  message?: string
  data?: unknown
}

function looksLikeHtmlErrorPage(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase()
  return trimmed.startsWith('<!doctype html')
    || trimmed.startsWith('<html')
    || /<title>[^<]*(bad gateway|502|503|504|gateway time-out)/i.test(text)
}

function friendlyHttpError(status: number | undefined, fallback: string): string | null {
  if (status === 502) {
    return 'PDF render service is unavailable. Ensure the laravel-pdf container is running.'
  }
  if (status === 503 || status === 504) {
    return 'The server timed out while generating the PDF. Try again in a moment.'
  }
  if (status === 500) {
    return 'PDF generation failed on the server. Check admin worker health and try again.'
  }
  if (status && status >= 400) return fallback
  return null
}

function sanitizeErrorText(text: string, status?: number): string {
  if (looksLikeHtmlErrorPage(text)) {
    return friendlyHttpError(status, 'The server returned an error instead of the requested file.')
      ?? 'The server returned an error instead of the requested file.'
  }
  return text.slice(0, 500)
}

async function messageFromErrorData(data: unknown, status?: number): Promise<string | null> {
  if (!data) return null

  if (typeof data === 'object' && data !== null && typeof (data as Blob).text === 'function') {
    try {
      const text = await (data as Blob).text()
      if (!text.trim()) return null
      try {
        const parsed = JSON.parse(text) as { message?: string, data?: { message?: string } }
        return parsed.data?.message ?? parsed.message ?? sanitizeErrorText(text, status)
      }
      catch {
        return sanitizeErrorText(text, status)
      }
    }
    catch {
      return null
    }
  }

  if (typeof data === 'object' && data !== null) {
    const obj = data as { message?: string, data?: { message?: string } }
    return obj.data?.message ?? obj.message ?? null
  }

  if (typeof data === 'string' && data.trim()) return sanitizeErrorText(data, status)
  return null
}

/** Sync parse of API error messages from $fetch/ofetch failures. */
export function syncFetchErrorMessage(err: unknown, fallback: string): string {
  const e = err as FetchErrorShape

  if (typeof e.data === 'object' && e.data !== null && typeof (e.data as Blob).text !== 'function') {
    const obj = e.data as { message?: string, data?: { message?: string } }
    const msg = obj.message ?? obj.data?.message
    if (msg) return msg
  }

  if (e.message && !/^\[(?:GET|POST|PUT|PATCH|DELETE)\]/i.test(e.message)) {
    return e.message
  }

  return fallback
}

/** Parse API error messages from $fetch/ofetch failures (including blob responses). */
export async function fetchErrorMessage(err: unknown, fallback: string): Promise<string> {
  const e = err as FetchErrorShape
  const response = (err as { response?: Response })?.response
  const status = e.statusCode ?? e.status ?? response?.status

  const fromData = await messageFromErrorData(e.data, status)
  if (fromData) return fromData

  if (response) {
    try {
      const clone = response.clone()
      const contentType = clone.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const body = await clone.json() as { message?: string, data?: { message?: string } }
        return body.data?.message ?? body.message ?? fallback
      }
      const text = (await clone.text()).trim()
      if (text) return sanitizeErrorText(text, status)
    }
    catch {
      // ignore parse failures
    }
  }

  if (e.message && !/^\[(?:GET|POST|PUT|PATCH|DELETE)\]/i.test(e.message)) {
    return e.message
  }

  return friendlyHttpError(status, fallback) ?? fallback
}

/** Reject blob responses that are HTML/text error pages instead of PDF bytes. */
export async function assertPdfBlob(blob: Blob): Promise<void> {
  const type = blob.type?.toLowerCase() ?? ''
  if (type.includes('html') || (type.includes('text/') && !type.includes('pdf'))) {
    throw new Error('PDF render service returned an error page instead of a PDF.')
  }

  const head = await blob.slice(0, 5).text()
  if (!head.startsWith('%PDF')) {
    throw new Error('PDF render service returned an invalid document.')
  }
}
