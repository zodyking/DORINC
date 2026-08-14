import type { H3Event } from 'h3'
import { deleteCookie, getCookie, setCookie } from 'h3'
import { SESSION_ABSOLUTE_TTL_MS } from './auth.service'

export const SESSION_COOKIE = 'dorinc_session'

function sessionCookieAttrs() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export function setSessionCookie(event: H3Event, token: string) {
  setCookie(event, SESSION_COOKIE, token, {
    ...sessionCookieAttrs(),
    maxAge: Math.floor(SESSION_ABSOLUTE_TTL_MS / 1000),
  })
}

export function getSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, SESSION_COOKIE)
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, sessionCookieAttrs())
}

/** True when middleware confirmed the browser sent a dead session cookie. */
export function hasStaleSessionCookie(event: H3Event): boolean {
  return event.context.staleSessionCookie === true
}

/** Drop a dead `dorinc_session` so the next sign-in can set a fresh ticket. */
export function clearStaleSessionCookie(event: H3Event): boolean {
  if (!hasStaleSessionCookie(event)) return false
  clearSessionCookie(event)
  return true
}
