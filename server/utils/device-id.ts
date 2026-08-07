import type { H3Event } from 'h3'
import { getCookie, getHeader, setCookie } from 'h3'
import {
  DEVICE_ID_COOKIE,
  DEVICE_ID_HEADER,
  DEVICE_ID_MAX_AGE_SEC,
  createDeviceId,
  normalizeDeviceId,
} from '../../shared/device-id'

export {
  DEVICE_ID_COOKIE,
  DEVICE_ID_HEADER,
  DEVICE_ID_MAX_AGE_SEC,
  createDeviceId,
  normalizeDeviceId,
} from '../../shared/device-id'

/** Read a validated device id from cookie, header, or optional body field (no create). */
export function readDeviceId(
  event: H3Event,
  bodyDeviceId?: unknown,
): string | null {
  return (
    normalizeDeviceId(getCookie(event, DEVICE_ID_COOKIE))
    ?? normalizeDeviceId(getHeader(event, DEVICE_ID_HEADER))
    ?? normalizeDeviceId(bodyDeviceId)
  )
}

/**
 * Ensure the request has a durable first-party device id cookie.
 * Prefers existing cookie → header → body → newly generated UUID.
 */
export function ensureDeviceId(
  event: H3Event,
  bodyDeviceId?: unknown,
): string {
  const existing = readDeviceId(event, bodyDeviceId)
  const id = existing ?? createDeviceId()
  setDeviceIdCookie(event, id)
  return id
}

export function setDeviceIdCookie(event: H3Event, deviceId: string): void {
  const id = normalizeDeviceId(deviceId)
  if (!id) return
  setCookie(event, DEVICE_ID_COOKIE, id, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_ID_MAX_AGE_SEC,
  })
}
