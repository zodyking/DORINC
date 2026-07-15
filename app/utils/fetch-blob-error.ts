type FetchErrorShape = {
  statusCode?: number
  status?: number
  statusMessage?: string
  message?: string
  data?: unknown
}

async function messageFromErrorData(data: unknown): Promise<string | null> {
  if (!data) return null

  if (typeof data === 'object' && data !== null && typeof (data as Blob).text === 'function') {
    try {
      const text = await (data as Blob).text()
      if (!text.trim()) return null
      try {
        const parsed = JSON.parse(text) as { message?: string, data?: { message?: string } }
        return parsed.data?.message ?? parsed.message ?? text.slice(0, 500)
      }
      catch {
        return text.slice(0, 500)
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

  if (typeof data === 'string' && data.trim()) return data.slice(0, 500)
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

  const fromData = await messageFromErrorData(e.data)
  if (fromData) return fromData

  const response = (err as { response?: Response })?.response
  if (response) {
    try {
      const clone = response.clone()
      const contentType = clone.headers.get('content-type') ?? ''
      if (contentType.includes('application/json')) {
        const body = await clone.json() as { message?: string, data?: { message?: string } }
        return body.data?.message ?? body.message ?? fallback
      }
      const text = (await clone.text()).trim()
      if (text) return text.slice(0, 500)
    }
    catch {
      // ignore parse failures
    }
  }

  if (e.message && !/^\[(?:GET|POST|PUT|PATCH|DELETE)\]/i.test(e.message)) {
    return e.message
  }

  const status = e.statusCode ?? e.status ?? response?.status
  if (status === 502) {
    return 'PDF render service is unavailable. Ensure the laravel-pdf container is running.'
  }
  if (status === 500) {
    return 'PDF generation failed on the server. Check admin worker health and try again.'
  }

  return fallback
}
