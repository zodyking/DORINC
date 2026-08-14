export const COOKIE_PROBE_NAME = 'dorinc_cookie_ok'
export const LOGIN_COOKIE_INCOMPLETE_MESSAGE = 'Sign-in did not complete — please try again'

function cookieEnabled(): boolean {
  if (typeof document === 'undefined') return true
  try {
    const token = `1.${Date.now()}`
    const secure = typeof location !== 'undefined' && location.protocol === 'https:'
    const attrs = [
      `${COOKIE_PROBE_NAME}=${encodeURIComponent(token)}`,
      'Path=/',
      'Max-Age=120',
      'SameSite=Lax',
    ]
    if (secure) attrs.push('Secure')
    document.cookie = attrs.join('; ')
    const found = document.cookie.split(';').some((part) => {
      const [rawKey, ...rest] = part.trim().split('=')
      return rawKey === COOKIE_PROBE_NAME && decodeURIComponent(rest.join('=')) === token
    })
    return found
  }
  catch {
    return false
  }
}

/** True when this browser will store a first-party cookie we can read back. */
export function probeFirstPartyCookies(): boolean {
  return cookieEnabled()
}

/**
 * Ask the browser for storage access when it exposes a prompt, then re-check
 * first-party cookies. There is no API to open Chrome/Safari cookie settings.
 */
export async function requestFirstPartyCookieAccess(): Promise<boolean> {
  if (typeof document === 'undefined') return true
  const doc = document as Document & {
    hasStorageAccess?: () => Promise<boolean>
    requestStorageAccess?: () => Promise<void>
  }
  try {
    if (typeof doc.hasStorageAccess === 'function' && typeof doc.requestStorageAccess === 'function') {
      const already = await doc.hasStorageAccess()
      if (!already) await doc.requestStorageAccess()
    }
  }
  catch {
    // User dismissed the prompt, or this context cannot prompt.
  }
  return probeFirstPartyCookies()
}

export function isLoginCookieIncompleteMessage(message: string | null | undefined): boolean {
  return (message ?? '').trim() === LOGIN_COOKIE_INCOMPLETE_MESSAGE
}
