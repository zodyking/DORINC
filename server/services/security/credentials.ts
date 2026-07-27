import { createHmac } from 'node:crypto'
import { getSessionSecret } from '../app-config.service'

export interface CredentialCapture {
  attemptedIdentifier: string | null
  attemptedPortal: string | null
  passwordFingerprint: string | null
  passwordLength: number | null
}

/**
 * Attempted passwords are never stored. Instead we keep a keyed hash truncated
 * to 12 hex characters, which is enough to tell "the same password was tried 40
 * times" apart from "40 different passwords were sprayed" while being useless
 * to anyone who reads the table — it cannot be reversed without the install's
 * session secret, and the truncation makes offline comparison across installs
 * meaningless.
 */
export function fingerprintPassword(password: string): string | null {
  if (!password) return null
  const secret = getSessionSecret()
  if (!secret) return null
  return createHmac('sha256', `${secret}:access-events`).update(password).digest('hex').slice(0, 12)
}

export function captureCredentials(input: {
  identifier: string | null | undefined
  password: string | null | undefined
  portal: string | null | undefined
  /** Set false to record only that an attempt happened. */
  enabled: boolean
}): CredentialCapture {
  if (!input.enabled) {
    return {
      attemptedIdentifier: null,
      attemptedPortal: input.portal ?? null,
      passwordFingerprint: null,
      passwordLength: null,
    }
  }

  const identifier = input.identifier?.trim() ?? ''
  const password = input.password ?? ''

  return {
    attemptedIdentifier: identifier ? identifier.slice(0, 320).toLowerCase() : null,
    attemptedPortal: input.portal ?? null,
    passwordFingerprint: fingerprintPassword(password),
    passwordLength: password ? password.length : null,
  }
}
