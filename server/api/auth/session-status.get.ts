import { clearStaleSessionCookie } from '../../auth/session-cookie'
import type { AuthContext } from '../../utils/require-permission'

/**
 * Login-page bootstrap: report whether this device still holds a dead session
 * cookie (deleted/expired account) and clear it so the next sign-in can stick.
 * Does not run on login POST — that path sets a new cookie in the same response.
 */
export default defineEventHandler((event) => {
  const auth = event.context.auth as AuthContext | undefined
  const staleCookieCleared = auth?.user ? false : clearStaleSessionCookie(event)
  return {
    signedIn: Boolean(auth?.user),
    staleCookieCleared,
  }
})
