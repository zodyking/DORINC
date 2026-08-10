import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { deleteCookie, getCookie, setCookie } from 'h3'
import { getSessionSecret } from '../services/app-config.service'
import { normalizeClientIp } from '../utils/client-ip'
import { normalizeDeviceId } from '../utils/device-id'

export const OUTSIDE_GEO_BYPASS_COOKIE = 'dorinc_outside_geo'
/**
 * Signed cookie TTL. Actual browsing outside the fence also requires a
 * tab-scoped sessionStorage flag — closing/reopening a tab forces re-verify.
 */
const BYPASS_TTL_MS = 12 * 60 * 60 * 1000
const PART_SEP = '|'

export interface OutsideGeoBypass {
  userId: string
  ipAddress: string | null
  userAgentHash: string | null
  deviceId: string | null
  exp: number
}

function signPayload(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function hashUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null
  return createHash('sha256').update(userAgent).digest('hex').slice(0, 32)
}

/** Create a short-lived signed bypass token for a known user/IP/device. */
export function createOutsideGeoBypassToken(input: {
  userId: string
  ipAddress?: string | null
  userAgent?: string | null
  deviceId?: string | null
}): string {
  const secret = getSessionSecret()
  if (!secret) throw new Error('SESSION_SECRET_NOT_CONFIGURED')
  const ip = normalizeClientIp(input.ipAddress) ?? input.ipAddress?.trim() ?? ''
  const uaHash = hashUserAgent(input.userAgent) ?? ''
  const deviceId = normalizeDeviceId(input.deviceId) ?? ''
  const exp = Date.now() + BYPASS_TTL_MS
  // v2 payload includes device_id; older tokens omit it (handled in verify).
  const payload = [input.userId, ip || '-', uaHash || '-', deviceId || '-', String(exp)].join(PART_SEP)
  const sig = signPayload(payload, secret)
  return Buffer.from(`${payload}${PART_SEP}${sig}`).toString('base64url')
}

export function verifyOutsideGeoBypassToken(token: string): OutsideGeoBypass | null {
  const secret = getSessionSecret()
  if (!secret) return null
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const lastSep = decoded.lastIndexOf(PART_SEP)
    if (lastSep < 0) return null
    const payload = decoded.slice(0, lastSep)
    const sig = decoded.slice(lastSep + 1)
    const expected = signPayload(payload, secret)
    if (sig.length !== expected.length) return null
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null

    const parts = payload.split(PART_SEP)
    // v2: userId|ip|uaHash|deviceId|exp
    // v1: userId|ip|uaHash|exp
    let userId: string | undefined
    let ipRaw: string | undefined
    let uaHashRaw: string | undefined
    let deviceRaw: string | undefined
    let expRaw: string | undefined
    if (parts.length === 5) {
      ;[userId, ipRaw, uaHashRaw, deviceRaw, expRaw] = parts
    }
    else if (parts.length === 4) {
      ;[userId, ipRaw, uaHashRaw, expRaw] = parts
      deviceRaw = '-'
    }
    else {
      return null
    }

    if (!userId || !expRaw) return null
    const exp = Number(expRaw)
    if (!Number.isFinite(exp) || Date.now() > exp) return null

    return {
      userId,
      ipAddress: !ipRaw || ipRaw === '-' ? null : ipRaw,
      userAgentHash: !uaHashRaw || uaHashRaw === '-' ? null : uaHashRaw,
      deviceId: normalizeDeviceId(deviceRaw === '-' ? null : deviceRaw),
      exp,
    }
  }
  catch {
    return null
  }
}

export function setOutsideGeoBypassCookie(event: H3Event, token: string) {
  setCookie(event, OUTSIDE_GEO_BYPASS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(BYPASS_TTL_MS / 1000),
  })
}

export function getOutsideGeoBypassCookie(event: H3Event): string | undefined {
  return getCookie(event, OUTSIDE_GEO_BYPASS_COOKIE)
}

export function clearOutsideGeoBypassCookie(event: H3Event) {
  deleteCookie(event, OUTSIDE_GEO_BYPASS_COOKIE, { path: '/' })
}

/**
 * True when the request carries a valid outside-geofence bypass for this
 * IP/device, optionally restricted to a specific user id (login path).
 *
 * Set `requireTabSession: true` for visit/API gates so a leftover cookie
 * alone cannot skip the geofence in a new tab (sessionStorage is tab-scoped).
 */
export function hasValidOutsideGeoBypass(
  event: H3Event,
  input: {
    ipAddress?: string | null
    userAgent?: string | null
    deviceId?: string | null
    userId?: string | null
    /** When true, client must also send the tab session header/flag. */
    requireTabSession?: boolean
    tabSessionConfirmed?: boolean
  } = {},
): OutsideGeoBypass | null {
  const raw = getOutsideGeoBypassCookie(event)
  if (!raw) return null
  const bypass = verifyOutsideGeoBypassToken(raw)
  if (!bypass) return null

  if (input.requireTabSession && !input.tabSessionConfirmed) return null

  if (input.userId && bypass.userId !== input.userId) return null

  const requestIp = normalizeClientIp(input.ipAddress) ?? input.ipAddress ?? null
  if (bypass.ipAddress && requestIp && bypass.ipAddress !== requestIp) return null

  const requestDeviceId = normalizeDeviceId(input.deviceId)
  if (bypass.deviceId) {
    // Prefer stable device_id when the bypass was issued with one.
    if (!requestDeviceId || bypass.deviceId !== requestDeviceId) return null
    return bypass
  }

  const requestUaHash = hashUserAgent(input.userAgent)
  if (bypass.userAgentHash && requestUaHash && bypass.userAgentHash !== requestUaHash) return null

  return bypass
}
