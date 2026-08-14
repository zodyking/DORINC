import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('login cookie prompt', () => {
  const screen = readFileSync(resolve('app/components/auth/AuthScreen.vue'), 'utf8')
  const prompt = readFileSync(resolve('app/components/auth/AuthCookiePrompt.vue'), 'utf8')
  const me = readFileSync(resolve('server/api/auth/me.get.ts'), 'utf8')
  const status = readFileSync(resolve('server/api/auth/session-status.get.ts'), 'utf8')
  const middleware = readFileSync(resolve('server/middleware/auth-session.ts'), 'utf8')
  const cookie = readFileSync(resolve('server/auth/session-cookie.ts'), 'utf8')

  it('shows a bottom cookie prompt on the login screen', () => {
    expect(screen).toContain('AuthCookiePrompt')
    expect(screen).toContain('/api/auth/session-status')
    expect(screen).toContain('requestFirstPartyCookieAccess')
    expect(prompt).toContain('Allow cookies to stay signed in')
    expect(prompt).toContain('Previous sign-in was cleared')
    expect(prompt).toContain('role="dialog"')
  })

  it('clears a confirmed-dead session cookie without racing login Set-Cookie', () => {
    expect(status).toContain('clearStaleSessionCookie')
    expect(me).toContain('clearStaleSessionCookie')
    expect(me).toContain('staleCookieCleared')
    expect(middleware).toContain('staleSessionCookie = true')
    expect(middleware).not.toContain('clearStaleSessionCookie')
    expect(cookie).toContain('deleteCookie(event, SESSION_COOKIE, sessionCookieAttrs())')
  })
})
