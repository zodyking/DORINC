import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getSessionSecret } from '../services/app-config.service'

const TOKEN_TTL_MS = 5 * 60 * 1000

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/** Short-lived token that completes a staff login after device location is verified. */
export function createPendingLoginToken(sessionToken: string): string {
  const secret = getSessionSecret()
  if (!secret) throw new Error('SESSION_SECRET_NOT_CONFIGURED')
  const nonce = randomBytes(16).toString('hex')
  const payload = `${sessionToken}.${nonce}.${Date.now()}`
  const sig = signPayload(payload, secret)
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

export function verifyPendingLoginToken(token: string): string | null {
  const secret = getSessionSecret()
  if (!secret) return null
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const lastDot = decoded.lastIndexOf('.')
    if (lastDot < 0) return null
    const payload = decoded.slice(0, lastDot)
    const sig = decoded.slice(lastDot + 1)
    const expected = signPayload(payload, secret)
    if (sig.length !== expected.length) return null
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const [sessionToken, , ts] = payload.split('.')
    if (!sessionToken) return null
    const age = Date.now() - Number(ts)
    if (!Number.isFinite(age) || age < 0 || age > TOKEN_TTL_MS) return null
    return sessionToken
  }
  catch {
    return null
  }
}
