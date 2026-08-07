/** First-party persistent browser/device identity (cookie + localStorage + IndexedDB). */

export const DEVICE_ID_COOKIE = 'dorinc_device_id'
export const DEVICE_ID_STORAGE_KEY = 'dorinc_device_id'
export const DEVICE_ID_HEADER = 'x-device-id'
/** IndexedDB database + object store used as a durable backup. */
export const DEVICE_ID_IDB_NAME = 'dorinc-device'
export const DEVICE_ID_IDB_STORE = 'kv'
export const DEVICE_ID_IDB_KEY = 'device_id'

/** ~400 days — matches common browser max cookie lifetime. */
export const DEVICE_ID_MAX_AGE_SEC = 400 * 24 * 60 * 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Normalize and validate a device UUID. Returns null when invalid. */
export function normalizeDeviceId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!UUID_RE.test(trimmed)) return null
  return trimmed
}

export function isValidDeviceId(value: unknown): value is string {
  return normalizeDeviceId(value) != null
}

/** Create a new random device UUID (crypto.randomUUID when available). */
export function createDeviceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().toLowerCase()
  }
  // Fallback for older runtimes — still UUID-shaped.
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  }
  else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
