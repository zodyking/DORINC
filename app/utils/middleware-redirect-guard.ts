/**
 * Detect runaway client middleware redirects (login hangs + /api/auth/me storms).
 * Returns true when too many redirects land in a short window.
 */
const STORAGE_KEY = 'dorinc_mw_redirect_log'
const WINDOW_MS = 4000
const MAX_REDIRECTS = 10

/** In-memory fallback so the breaker still trips when sessionStorage fails. */
let memoryEntries: Array<{ t: number, p: string }> = []

export function noteMiddlewareRedirect(toPath: string): boolean {
  const now = Date.now()
  let entries: Array<{ t: number, p: string }> = []
  let storageOk = false
  if (typeof sessionStorage !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) entries = JSON.parse(raw) as Array<{ t: number, p: string }>
      storageOk = true
    }
    catch {
      entries = []
    }
  }
  if (!storageOk) entries = memoryEntries

  entries = entries.filter(entry => now - entry.t < WINDOW_MS)
  entries.push({ t: now, p: toPath })
  memoryEntries = entries
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    }
    catch {
      // private mode / quota — memoryEntries still counts this tab
    }
  }
  return entries.length >= MAX_REDIRECTS
}

export function clearMiddlewareRedirectLog() {
  memoryEntries = []
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  }
  catch {
    // ignore
  }
}
