export class FetchHardTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message)
    this.name = 'FetchHardTimeoutError'
  }
}

type FetchJsonHardTimeoutOptions = {
  method?: string
  body?: unknown
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * JSON fetch with a wall-clock timeout that fires even when the browser keeps
 * the request queued behind other same-origin connections (common on mobile).
 */
export async function fetchJsonWithHardTimeout<T>(
  url: string,
  options: FetchJsonHardTimeoutOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const controller = new AbortController()

  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort()
    }
    else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      signal: controller.signal,
    })

    const payload = await res.json().catch(() => null)

    if (!res.ok) {
      const err = new Error(
        (payload as { message?: string } | null)?.message ?? `Request failed (${res.status})`,
      ) as Error & { data?: unknown, statusCode?: number }
      err.data = payload
      err.statusCode = res.status
      throw err
    }

    return payload as T
  }
  catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new FetchHardTimeoutError()
    }
    throw err
  }
  finally {
    clearTimeout(timeoutId)
  }
}
