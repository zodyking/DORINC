import { describe, expect, it } from 'vitest'
import {
  COOKIE_PROBE_NAME,
  LOGIN_COOKIE_INCOMPLETE_MESSAGE,
  isLoginCookieIncompleteMessage,
  probeFirstPartyCookies,
} from '../../app/utils/cookie-probe'

describe('cookie probe helpers', () => {
  it('exports a probe cookie name that is not the HttpOnly session cookie', () => {
    expect(COOKIE_PROBE_NAME).toBe('dorinc_cookie_ok')
    expect(COOKIE_PROBE_NAME).not.toBe('dorinc_session')
  })

  it('treats missing document as cookies-available (SSR)', () => {
    expect(probeFirstPartyCookies()).toBe(true)
  })

  it('detects the incomplete-login copy used when the session cookie did not stick', () => {
    expect(isLoginCookieIncompleteMessage(LOGIN_COOKIE_INCOMPLETE_MESSAGE)).toBe(true)
    expect(isLoginCookieIncompleteMessage('Invalid email or password')).toBe(false)
  })
})
