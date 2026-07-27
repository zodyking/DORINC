import { isPrivateIp, normalizeClientIp } from '../utils/client-ip'
import { lookupIpGeo } from '../lib/ip-geo-lookup.mjs'

export { normalizeClientIp } from '../utils/client-ip'
export { formatLocationParts } from '../lib/ip-geo-lookup.mjs'

export interface IpGeoResult {
  label: string | null
  latitude: number | null
  longitude: number | null
  city: string | null
  region: string | null
  regionCode: string | null
  postalCode: string | null
  country: string | null
  countryCode: string | null
  timezone: string | null
}

interface CachedGeo {
  value: IpGeoResult | null
  expiresAt: number
}

const IP_GEO_CACHE = new Map<string, CachedGeo>()
const IP_GEO_TTL_MS = 24 * 60 * 60 * 1000
/** Failed lookups are cached briefly so a provider outage isn't hammered. */
const IP_GEO_MISS_TTL_MS = 5 * 60 * 1000
const IP_GEO_CACHE_MAX = 5000

/** In-flight lookups are shared so a burst of requests makes one provider call. */
const INFLIGHT = new Map<string, Promise<IpGeoResult | null>>()

function readGeoCache(ip: string): IpGeoResult | null | undefined {
  const hit = IP_GEO_CACHE.get(ip)
  if (!hit) return undefined
  if (hit.expiresAt < Date.now()) {
    IP_GEO_CACHE.delete(ip)
    return undefined
  }
  return hit.value
}

function writeGeoCache(ip: string, value: IpGeoResult | null): void {
  if (IP_GEO_CACHE.size >= IP_GEO_CACHE_MAX) {
    const oldest = IP_GEO_CACHE.keys().next().value
    if (oldest) IP_GEO_CACHE.delete(oldest)
  }
  const ttl = value ? IP_GEO_TTL_MS : IP_GEO_MISS_TTL_MS
  IP_GEO_CACHE.set(ip, { value, expiresAt: Date.now() + ttl })
}

/**
 * Cache-only lookup for the hot request path — never triggers a network call.
 * Returns `undefined` when the IP has not been resolved yet.
 */
export function peekIpGeo(ip: string | null | undefined): IpGeoResult | null | undefined {
  const normalized = normalizeClientIp(ip)
  if (!normalized) return undefined
  return readGeoCache(normalized)
}

/**
 * Resolve approximate coordinates + label for a public IP, cached in memory
 * for 24h. Returns null for private/unknown IPs so callers can tell "no
 * location available" apart from "located outside the fence".
 */
export async function resolveIpGeo(ip: string | null | undefined): Promise<IpGeoResult | null> {
  const normalized = normalizeClientIp(ip)
  if (!normalized || isPrivateIp(normalized)) return null

  const cached = readGeoCache(normalized)
  if (cached !== undefined) return cached

  const existing = INFLIGHT.get(normalized)
  if (existing) return existing

  const pending = (async () => {
    try {
      const result = await lookupIpGeo(normalized) as IpGeoResult | null
      writeGeoCache(normalized, result)
      return result
    }
    finally {
      INFLIGHT.delete(normalized)
    }
  })()

  INFLIGHT.set(normalized, pending)
  return pending
}

/** Resolve a human-readable city/state label for a public IP address. */
export async function resolveIpLocation(ip: string | null | undefined): Promise<string | null> {
  const geo = await resolveIpGeo(ip)
  return geo?.label ?? null
}

/** Test/maintenance hook — drops every cached lookup. */
export function clearIpGeoCache(): void {
  IP_GEO_CACHE.clear()
  INFLIGHT.clear()
}