import type { H3Event } from 'h3'
import { deleteCookie, getCookie, setCookie } from 'h3'
import { SESSION_ABSOLUTE_TTL_MS } from './auth.service'

export const SESSION_COOKIE = 'dorinc_session'

export function setSessionCookie(event: H3Event, token: string) {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_ABSOLUTE_TTL_MS / 1000),
  })
}

export function getSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, SESSION_COOKIE)
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}
