import { resolveSession } from '../auth/auth.service'
import { getSessionCookie } from '../auth/session-cookie'
import { useDb } from '../db/client'

/**
 * Attach the auth context (user + permission overrides) to every request
 * that carries a valid session cookie. Permission enforcement happens in
 * route handlers via requirePermission().
 */
export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  const token = getSessionCookie(event)
  if (!token) return

  try {
    const resolved = await resolveSession(useDb(), token)
    if (resolved) {
      event.context.auth = {
        user: resolved.user,
        overrides: resolved.overrides,
        sessionId: resolved.sessionId,
        sessionToken: token,
      }
    }
  }
  catch (err) {
    // A DB outage must not turn into a silent auth bypass — requests just
    // proceed unauthenticated and permission checks will reject them.
    console.error(`[auth] session resolution failed: ${(err as Error).message}`) // eslint-disable-line no-console
  }
})
