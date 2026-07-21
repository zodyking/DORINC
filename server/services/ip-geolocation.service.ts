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
}

export interface IpLocationResult {
  label: string
}

export interface IpGeoResult {
  label: string | null
  latitude: number | null
  longitude: number | null
  country: string | null
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

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) return null
    return await res.json() as T
  }
  catch {
    clearTimeout(timeoutId)
    return null
  }
}

async function lookupWithIpApi(ip: string): Promise<IpLocationResult | null> {
  const data = await fetchJson<IpApiResponse>(
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,region,regionName,country,countryCode,zip,lat,lon`,
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

  const [fromIpApi, fromIpWho] = await Promise.all([
    lookupWithIpApi(normalized),
    lookupWithIpWho(normalized),
  ])

  const best = pickMoreSpecificLocation(fromIpApi, fromIpWho)
  return best?.label ?? null
}

interface CachedGeo {
  value: IpGeoResult | null
  expiresAt: number
}

const IP_GEO_CACHE = new Map<string, CachedGeo>()
const IP_GEO_TTL_MS = 24 * 60 * 60 * 1000
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

async function lookupGeoWithIpApi(ip: string): Promise<IpGeoResult | null> {
  const data = await fetchJson<IpApiResponse>(
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,region,regionName,country,countryCode,zip,lat,lon`,
    3000,
  )
  if (data?.status !== 'success') return null
  if (typeof data.lat !== 'number' || typeof data.lon !== 'number') return null
  return {
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
  }
}

async function lookupGeoWithIpWho(ip: string): Promise<IpGeoResult | null> {
  const data = await fetchJson<IpWhoResponse>(`https://ipwho.is/${encodeURIComponent(ip)}`, 3000)
  if (!data?.success) return null
  if (typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null
  return {
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
 * Resolve approximate coordinates + label for a public IP, cached in memory
 * for 24h. Returns null for private/unknown IPs so callers can fail open.
 */
export async function resolveIpGeo(ip: string | null | undefined): Promise<IpGeoResult | null> {
  const normalized = normalizeClientIp(ip)
  if (!normalized || isPrivateIp(normalized)) return null

  const cached = readGeoCache(normalized)
  if (cached !== undefined) return cached

  const [fromIpApi, fromIpWho] = await Promise.all([
    lookupGeoWithIpApi(normalized),
    lookupGeoWithIpWho(normalized),
  ])

  const result = fromIpApi ?? fromIpWho
  writeGeoCache(normalized, result)
  return result
}

