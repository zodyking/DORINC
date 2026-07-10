type FetchErrorShape = {
  statusCode?: number
  status?: number
  statusMessage?: string
  message?: string
  data?: {
    message?: string
    data?: { message?: string }
  }
}

/** Parse API error messages from $fetch/ofetch failures (including blob responses). */
export async function fetchErrorMessage(err: unknown, fallback: string): Promise<string> {
  const e = err as FetchErrorShape
  const nested = e.data?.data?.message ?? e.data?.message
  if (nested) return nested

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

  if (e.message && !/^\[GET\]|\[POST\]|\[PUT\]|\[PATCH\]|\[DELETE\]/i.test(e.message)) {
    return e.message
  }

  const status = e.statusCode ?? e.status
  if (status === 502) {
    return 'PDF render service is unavailable. Ensure the laravel-pdf container is running.'
  }
  if (status === 500) {
    return 'PDF generation failed on the server. Check admin worker health and try again.'
  }

  return fallback
}
