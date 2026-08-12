/**
 * Detect runaway client middleware redirects (login hangs + /api/auth/me storms).
 * Returns true when too many redirects land in a short window.
 */
const STORAGE_KEY = 'dorinc_mw_redirect_log'
const WINDOW_MS = 4000
const MAX_REDIRECTS = 10

export function noteMiddlewareRedirect(toPath: string): boolean {
  if (typeof sessionStorage === 'undefined') return false
  const now = Date.now()
  let entries: Array<{ t: number, p: string }> = []
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) entries = JSON.parse(raw) as Array<{ t: number, p: string }>
  }
  catch {
    entries = []
  }
  entries = entries.filter(entry => now - entry.t < WINDOW_MS)
  entries.push({ t: now, p: toPath })
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  }
  catch {
    // private mode / quota — still trip based on this call batch via length
  }
  return entries.length >= MAX_REDIRECTS
}

export function clearMiddlewareRedirectLog() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  }
  catch {
    // ignore
  }
}
