import type { H3Event } from 'h3'
import { getHeader } from 'h3'
import { isPrivateIp, normalizeClientIp } from '../utils/client-ip'

export { normalizeClientIp } from '../utils/client-ip'

const US_STATE_ABBREVS: Record<string, string> = {
  Alabama: 'AL',
  Alaska: 'AK',
  Arizona: 'AZ',
  Arkansas: 'AR',
  California: 'CA',
  Colorado: 'CO',
  Connecticut: 'CT',
  Delaware: 'DE',
  'District of Columbia': 'DC',
  Florida: 'FL',
  Georgia: 'GA',
  Hawaii: 'HI',
  Idaho: 'ID',
  Illinois: 'IL',
  Indiana: 'IN',
  Iowa: 'IA',
  Kansas: 'KS',
  Kentucky: 'KY',
  Louisiana: 'LA',
  Maine: 'ME',
  Maryland: 'MD',
  Massachusetts: 'MA',
  Michigan: 'MI',
  Minnesota: 'MN',
  Mississippi: 'MS',
  Missouri: 'MO',
  Montana: 'MT',
  Nebraska: 'NE',
  Nevada: 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  Ohio: 'OH',
  Oklahoma: 'OK',
  Oregon: 'OR',
  Pennsylvania: 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  Tennessee: 'TN',
  Texas: 'TX',
  Utah: 'UT',
  Vermont: 'VT',
  Virginia: 'VA',
  Washington: 'WA',
  'West Virginia': 'WV',
  Wisconsin: 'WI',
  Wyoming: 'WY',
}

/** NYC ZIP prefixes map to borough names for more accurate city labels. */
const NYC_BOROUGH_BY_ZIP_PREFIX: Record<string, string> = {
  112: 'Brooklyn',
  113: 'Queens',
  114: 'Queens',
  116: 'Queens',
  104: 'Bronx',
  103: 'Staten Island',
  100: 'Manhattan',
  101: 'Manhattan',
  102: 'Manhattan',
}

interface IpWhoResponse {
  success?: boolean
  city?: string
  region?: string
  region_code?: string
  country?: string
  country_code?: string
  postal?: string
  latitude?: number
  longitude?: number
}

interface IpApiResponse {
  status?: string
  city?: string
  region?: string
  regionName?: string
  country?: string
  countryCode?: string
  zip?: string
  lat?: number
  lon?: number
  mobile?: boolean
  proxy?: boolean
  hosting?: boolean
}

interface IpApiCoResponse {
  error?: boolean
  reason?: string
  city?: string
  region?: string
  region_code?: string
  country_name?: string
  country_code?: string
  postal?: string
  latitude?: number
  longitude?: number
}

interface IpInfoResponse {
  city?: string
  region?: string
  country?: string
  postal?: string
  loc?: string
  bogon?: boolean
}

export interface IpLocationResult {
  label: string
}

export interface IpGeoResult {
  label: string | null
  latitude: number | null
  longitude: number | null
  country: string | null
  /** True when the source marked this IP as mobile / CGNAT-prone. */
  mobile?: boolean
  /** Provider sources that contributed to this result. */
  sources?: string[]
}

interface ProviderGeo {
  source: string
  label: string | null
  latitude: number
  longitude: number
  country: string | null
  mobile?: boolean
  proxy?: boolean
  hosting?: boolean
  /** Higher is better. */
  weight: number
}

function abbreviateRegion(region: string, regionCode?: string, countryCode?: string): string {
  const trimmed = region.trim()
  if (!trimmed) return ''
  if (countryCode === 'US') {
    if (trimmed.length === 2) return trimmed.toUpperCase()
    return US_STATE_ABBREVS[trimmed] || trimmed
  }
  return regionCode?.trim() || trimmed
}

function refineCityLabel(
  city: string,
  zip: string | null | undefined,
  regionCode: string | null | undefined,
): string {
  const trimmedCity = city.trim()
  if (!trimmedCity) return trimmedCity

  const zipPrefix = zip?.trim().slice(0, 3)
  const isNewYork = regionCode === 'NY'
    || regionCode === 'New York'
    || trimmedCity.toLowerCase() === 'new york'

  if (isNewYork && zipPrefix) {
    const borough = NYC_BOROUGH_BY_ZIP_PREFIX[zipPrefix]
    if (borough) return borough
  }

  return trimmedCity
}

export function formatLocationParts(parts: {
  city?: string | null
  region?: string | null
  regionCode?: string | null
  country?: string | null
  countryCode?: string | null
  zip?: string | null
}): string | null {
  const rawCity = parts.city?.trim()
  if (!rawCity) return null

  const regionCode = abbreviateRegion(
    parts.region || '',
    parts.regionCode || undefined,
    parts.countryCode || undefined,
  )
  const city = refineCityLabel(rawCity, parts.zip, regionCode || parts.regionCode || parts.region)

  const segments = [city]
  if (regionCode) segments.push(regionCode)

  return segments.join(', ')
}

async function fetchJson<T>(url: string, timeoutMs: number, headers?: Record<string, string>): Promise<T | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { signal: controller.signal, headers })
    clearTimeout(timeoutId)
    if (!res.ok) return null
    return await res.json() as T
  }
  catch {
    clearTimeout(timeoutId)
    return null
  }
}

function haversineKm(a: { lat: number, lng: number }, b: { lat: number, lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const r = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Providers that agree within this distance are averaged (city-scale). */
const CONSENSUS_KM = 15

function toResult(cluster: ProviderGeo[]): IpGeoResult {
  const weightSum = cluster.reduce((sum, p) => sum + p.weight, 0)
  const latitude = cluster.reduce((sum, p) => sum + p.latitude * p.weight, 0) / weightSum
  const longitude = cluster.reduce((sum, p) => sum + p.longitude * p.weight, 0) / weightSum
  const bestLabel = [...cluster].sort((a, b) => {
    const aLen = a.label?.length ?? 0
    const bLen = b.label?.length ?? 0
    return bLen - aLen || b.weight - a.weight
  })[0]
  return {
    label: bestLabel?.label ?? null,
    latitude,
    longitude,
    country: bestLabel?.country ?? null,
    mobile: cluster.some(p => p.mobile),
    sources: cluster.map(p => p.source),
  }
}

/**
 * Combine provider coordinates. Prefer tight consensus; edge/high-trust
 * sources win when low-trust mobile/proxy points disagree across a city border.
 */
export function pickConsensusGeo(providers: ProviderGeo[]): IpGeoResult | null {
  const usable = providers.filter(p =>
    Number.isFinite(p.latitude)
    && Number.isFinite(p.longitude)
    && Math.abs(p.latitude) <= 90
    && Math.abs(p.longitude) <= 180,
  )
  if (!usable.length) return null

  const ranked = [...usable].sort((a, b) => b.weight - a.weight)

  // Edge / paid sources: if they disagree with weaker mobile/proxy hits, trust them alone.
  const authoritative = ranked.find(p => p.weight >= 5)
  if (authoritative) {
    const dissenters = usable.filter(p => p.source !== authoritative.source && haversineKm(
      { lat: authoritative.latitude, lng: authoritative.longitude },
      { lat: p.latitude, lng: p.longitude },
    ) > CONSENSUS_KM)
    const onlyWeakDisagree = dissenters.length > 0
      && dissenters.every(p => p.mobile || p.proxy || p.hosting || p.weight <= 3)
    if (onlyWeakDisagree) {
      return toResult([authoritative])
    }
  }

  // Prefer a high-weight cluster of agreeing providers.
  for (const seed of ranked) {
    const cluster = usable.filter(p => haversineKm(
      { lat: seed.latitude, lng: seed.longitude },
      { lat: p.latitude, lng: p.longitude },
    ) <= CONSENSUS_KM)
    if (cluster.length >= 2 || seed.weight >= 5) {
      return toResult(cluster)
    }
  }

  // Single remaining source: prefer non-mobile/non-proxy when available.
  const trusted = ranked.find(p => !p.mobile && !p.proxy && !p.hosting) ?? ranked[0]
  if (!trusted) return null
  return toResult([trusted])
}

async function lookupWithIpApi(ip: string): Promise<IpLocationResult | null> {
  const data = await fetchJson<IpApiResponse>(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,region,regionName,country,countryCode,zip,lat,lon,mobile,proxy,hosting`,
    3000,
  )
  if (data?.status !== 'success' || !data.city) return null

  const label = formatLocationParts({
    city: data.city,
    region: data.regionName || data.region,
    regionCode: data.region,
    country: data.country,
    countryCode: data.countryCode,
    zip: data.zip,
  })
  if (!label) return null

  return { label }
}

async function lookupWithIpWho(ip: string): Promise<IpLocationResult | null> {
  const data = await fetchJson<IpWhoResponse>(`https://ipwho.is/${encodeURIComponent(ip)}`, 3000)
  if (!data?.success) return null

  const label = formatLocationParts({
    city: data.city,
    region: data.region,
    regionCode: data.region_code,
    country: data.country,
    countryCode: data.country_code,
    zip: data.postal,
  })
  if (!label) return null

  return { label }
}

async function lookupWithIpApiCo(ip: string): Promise<IpLocationResult | null> {
  const data = await fetchJson<IpApiCoResponse>(
    `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    3000,
    { Accept: 'application/json' },
  )
  if (!data || data.error || !data.city) return null
  const label = formatLocationParts({
    city: data.city,
    region: data.region,
    regionCode: data.region_code,
    country: data.country_name,
    countryCode: data.country_code,
    zip: data.postal,
  })
  if (!label) return null
  return { label }
}

function pickMoreSpecificLocation(a: IpLocationResult | null, b: IpLocationResult | null): IpLocationResult | null {
  if (!a) return b
  if (!b) return a

  const boroughs = new Set(['Brooklyn', 'Queens', 'Bronx', 'Manhattan', 'Staten Island'])
  const aCity = a.label.split(',')[0]?.trim() ?? ''
  const bCity = b.label.split(',')[0]?.trim() ?? ''

  if (boroughs.has(aCity) && !boroughs.has(bCity)) return a
  if (boroughs.has(bCity) && !boroughs.has(aCity)) return b
  if (aCity.length > bCity.length) return a
  if (bCity.length > aCity.length) return b
  return a
}

/** Resolve a human-readable city/state label for a public IP address. */
export async function resolveIpLocation(ip: string | null | undefined): Promise<string | null> {
  const normalized = normalizeClientIp(ip)
  if (!normalized || isPrivateIp(normalized)) return null

  const [fromIpApi, fromIpWho, fromIpApiCo] = await Promise.all([
    lookupWithIpApi(normalized),
    lookupWithIpWho(normalized),
    lookupWithIpApiCo(normalized),
  ])

  const best = pickMoreSpecificLocation(
    pickMoreSpecificLocation(fromIpApi, fromIpWho),
    fromIpApiCo,
  )
  return best?.label ?? null
}

interface CachedGeo {
  value: IpGeoResult | null
  expiresAt: number
}

const IP_GEO_CACHE = new Map<string, CachedGeo>()
/** Coalesce concurrent cold lookups for the same IP (login + beacon + gate). */
const IP_GEO_INFLIGHT = new Map<string, Promise<IpGeoResult | null>>()
/** Shorter TTL so travelers are not stuck on a stale "inside" city for a full day. */
const IP_GEO_TTL_MS = 2 * 60 * 60 * 1000
const IP_GEO_CACHE_MAX = 5000

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
  IP_GEO_CACHE.set(ip, { value, expiresAt: Date.now() + IP_GEO_TTL_MS })
}

async function lookupGeoWithIpApi(ip: string): Promise<ProviderGeo | null> {
  const data = await fetchJson<IpApiResponse>(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,region,regionName,country,countryCode,zip,lat,lon,mobile,proxy,hosting`,
    3000,
  )
  if (data?.status !== 'success') return null
  if (typeof data.lat !== 'number' || typeof data.lon !== 'number') return null
  let weight = 3
  if (data.mobile) weight -= 1
  if (data.proxy || data.hosting) weight -= 1
  return {
    source: 'ip-api',
    label: formatLocationParts({
      city: data.city,
      region: data.regionName || data.region,
      regionCode: data.region,
      country: data.country,
      countryCode: data.countryCode,
      zip: data.zip,
    }),
    latitude: data.lat,
    longitude: data.lon,
    country: data.country ?? null,
    mobile: data.mobile === true,
    proxy: data.proxy === true,
    hosting: data.hosting === true,
    weight: Math.max(1, weight),
  }
}

async function lookupGeoWithIpWho(ip: string): Promise<ProviderGeo | null> {
  const data = await fetchJson<IpWhoResponse>(`https://ipwho.is/${encodeURIComponent(ip)}`, 3000)
  if (!data?.success) return null
  if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null
  return {
    source: 'ipwho',
    label: formatLocationParts({
      city: data.city,
      region: data.region,
      regionCode: data.region_code,
      country: data.country,
      countryCode: data.country_code,
      zip: data.postal,
    }),
    latitude: data.latitude,
    longitude: data.longitude,
    country: data.country ?? null,
    weight: 3,
  }
}

async function lookupGeoWithIpApiCo(ip: string): Promise<ProviderGeo | null> {
  const data = await fetchJson<IpApiCoResponse>(
    `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    3000,
    { Accept: 'application/json' },
  )
  if (!data || data.error) return null
  if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null
  return {
    source: 'ipapi.co',
    label: formatLocationParts({
      city: data.city,
      region: data.region,
      regionCode: data.region_code,
      country: data.country_name,
      countryCode: data.country_code,
      zip: data.postal,
    }),
    latitude: data.latitude,
    longitude: data.longitude,
    country: data.country_name ?? null,
    weight: 4,
  }
}

async function lookupGeoWithIpInfo(ip: string): Promise<ProviderGeo | null> {
  const token = process.env.IPINFO_TOKEN?.trim()
  if (!token) return null
  const data = await fetchJson<IpInfoResponse>(
    `https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${encodeURIComponent(token)}`,
    3000,
  )
  if (!data || data.bogon || !data.loc) return null
  const [latRaw, lngRaw] = data.loc.split(',')
  const latitude = Number(latRaw)
  const longitude = Number(lngRaw)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    source: 'ipinfo',
    label: formatLocationParts({
      city: data.city,
      region: data.region,
      regionCode: data.region,
      country: data.country,
      countryCode: data.country,
      zip: data.postal,
    }),
    latitude,
    longitude,
    country: data.country ?? null,
    weight: 5,
  }
}

/** Read Cloudflare visitor-location headers when the edge provides them. */
export function readCloudflareIpGeo(event: H3Event): ProviderGeo | null {
  const latRaw = getHeader(event, 'cf-iplatitude')
  const lngRaw = getHeader(event, 'cf-iplongitude')
  if (!latRaw || !lngRaw) return null
  const latitude = Number(latRaw)
  const longitude = Number(lngRaw)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null

  const city = getHeader(event, 'cf-ipcity')
  const region = getHeader(event, 'cf-region') || getHeader(event, 'cf-region-code')
  const regionCode = getHeader(event, 'cf-region-code')
  const country = getHeader(event, 'cf-ipcountry')
  const zip = getHeader(event, 'cf-postal-code')

  return {
    source: 'cloudflare',
    label: formatLocationParts({
      city,
      region,
      regionCode,
      country,
      countryCode: country,
      zip,
    }),
    latitude,
    longitude,
    country: country ?? null,
    weight: 6,
  }
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
 * Resolve approximate coordinates + label for a public IP using multiple
 * providers (and optional Cloudflare edge headers). Cached for 2h.
 */
export async function resolveIpGeo(
  ip: string | null | undefined,
  options: { cloudflare?: ProviderGeo | null } = {},
): Promise<IpGeoResult | null> {
  const normalized = normalizeClientIp(ip)
  if (!normalized || isPrivateIp(normalized)) return null

  const cached = readGeoCache(normalized)
  if (cached !== undefined) return cached

  const inflight = IP_GEO_INFLIGHT.get(normalized)
  if (inflight) return inflight

  const lookup = (async (): Promise<IpGeoResult | null> => {
    try {
      // Prefer a warm cache written by a racing sibling before we hit the network.
      const raced = readGeoCache(normalized)
      if (raced !== undefined) return raced

      const providers = await Promise.all([
        Promise.resolve(options.cloudflare ?? null),
        lookupGeoWithIpApi(normalized),
        lookupGeoWithIpWho(normalized),
        lookupGeoWithIpApiCo(normalized),
        lookupGeoWithIpInfo(normalized),
      ])

      const result = pickConsensusGeo(providers.filter((p): p is ProviderGeo => !!p))
      writeGeoCache(normalized, result)
      return result
    }
    finally {
      IP_GEO_INFLIGHT.delete(normalized)
    }
  })()

  IP_GEO_INFLIGHT.set(normalized, lookup)
  return lookup
}

/** Convenience wrapper: include Cloudflare edge geo when present on the request. */
export async function resolveIpGeoForEvent(
  event: H3Event,
  ip: string | null | undefined,
): Promise<IpGeoResult | null> {
  return resolveIpGeo(ip, { cloudflare: readCloudflareIpGeo(event) })
}
