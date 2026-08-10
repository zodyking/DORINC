import { getHeader, readBody, sendRedirect } from 'h3'
import { getClientIp } from '../../../utils/client-ip'
import { ensureDeviceId } from '../../../utils/device-id'
import { useDb } from '../../../db/client'
import {
  createOutsideGeoBypassToken,
  hasValidOutsideGeoBypass,
  setOutsideGeoBypassCookie,
} from '../../../auth/outside-geo-bypass'
import { verifyOutsideGeoCode } from '../../../services/outside-geo-verify.service'
import { RateLimitError, consumeRateLimit } from '../../../services/rate-limit.service'
import { rateLimitKeyFromIp } from '../../../utils/require-rate-limit'

function extractCode(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const record = body as Record<string, unknown>
  const raw = record.code
  return typeof raw === 'string' ? raw.replace(/\s+/g, '').trim() : ''
}

/**
 * Verifies the 6-digit code via form POST and redirects.
 * Never returns JSON (no scope / identity leakage in the browser console).
 */
export default defineEventHandler(async (event) => {
  try {
    await consumeRateLimit(useDb(), 'outside_geo', rateLimitKeyFromIp(event, 'verify'))
  }
  catch (err) {
    if (err instanceof RateLimitError) {
      return sendRedirect(event, '/auth/verify-location?err=1', 303)
    }
    return sendRedirect(event, '/auth/verify-location?err=1', 303)
  }

  try {
    const ipAddress = getClientIp(event)
    const userAgent = getHeader(event, 'user-agent') ?? null
    const deviceId = ensureDeviceId(event)

    if (hasValidOutsideGeoBypass(event, { ipAddress, userAgent, deviceId })) {
      // Re-arm tab session on the login landing page via geo_ok query.
      return sendRedirect(event, '/auth/login?geo_ok=1', 303)
    }

    const body = await readBody(event).catch(() => null)
    const code = extractCode(body)

    if (!/^\d{6}$/.test(code)) {
      return sendRedirect(event, '/auth/verify-location?err=1', 303)
    }

    const identity = await verifyOutsideGeoCode(useDb(), {
      code,
      ipAddress,
      userAgent,
    })
    if (!identity) {
      return sendRedirect(event, '/auth/verify-location?err=1', 303)
    }

    const token = createOutsideGeoBypassToken({
      userId: identity.userId,
      ipAddress,
      userAgent,
      deviceId,
    })
    setOutsideGeoBypassCookie(event, token)

    // geo_ok arms tab-scoped sessionStorage so a new tab cannot reuse the cookie alone.
    return sendRedirect(event, '/auth/login?geo_ok=1', 303)
  }
  catch {
    return sendRedirect(event, '/auth/verify-location?err=1', 303)
  }
})
