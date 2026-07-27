// Provider calls + label formatting for IP geolocation.
//
// Plain JS so the background worker (.mjs) and the Nitro request path (TS
// wrapper in services/ip-geolocation.service.ts) resolve locations identically.
// Two free providers are queried in parallel and the more specific answer wins;
// either one being down degrades accuracy rather than breaking the lookup.

const US_STATE_ABBREVS = {
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
const NYC_BOROUGH_BY_ZIP_PREFIX = {
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

const NYC_BOROUGHS = new Set(['Brooklyn', 'Queens', 'Bronx', 'Manhattan', 'Staten Island'])

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^localhost$/i,
]

export function isPrivateIpValue(ip) {
  if (!ip) return true
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip))
}

function abbreviateRegion(region, regionCode, countryCode) {
  const trimmed = (region || '').trim()
  if (!trimmed) return ''
  if (countryCode === 'US') {
    if (trimmed.length === 2) return trimmed.toUpperCase()
    return US_STATE_ABBREVS[trimmed] || trimmed
  }
  return (regionCode || '').trim() || trimmed
}

function refineCityLabel(city, zip, regionCode) {
  const trimmedCity = (city || '').trim()
  if (!trimmedCity) return trimmedCity

  const zipPrefix = zip ? String(zip).trim().slice(0, 3) : ''
  const isNewYork = regionCode === 'NY'
    || regionCode === 'New York'
    || trimmedCity.toLowerCase() === 'new york'

  if (isNewYork && zipPrefix) {
    const borough = NYC_BOROUGH_BY_ZIP_PREFIX[zipPrefix]
    if (borough) return borough
  }

  return trimmedCity
}

/** `Brooklyn, NY` style label, or null when the provider gave us no city. */
export function formatLocationParts(parts) {
  const rawCity = parts.city ? String(parts.city).trim() : ''
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

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  }
  catch {
    return null
  }
  finally {
    clearTimeout(timeoutId)
  }
}

function normalizeResult(parts) {
  const label = formatLocationParts(parts)
  return {
    label,
    latitude: typeof parts.latitude === 'number' ? parts.latitude : null,
    longitude: typeof parts.longitude === 'number' ? parts.longitude : null,
    city: refineCityLabel(
      parts.city || '',
      parts.zip,
      abbreviateRegion(parts.region || '', parts.regionCode, parts.countryCode) || parts.regionCode,
    ) || null,
    region: parts.region || null,
    regionCode: abbreviateRegion(parts.region || '', parts.regionCode, parts.countryCode) || null,
    postalCode: parts.zip || null,
    country: parts.country || null,
    countryCode: parts.countryCode || null,
    timezone: parts.timezone || null,
  }
}

async function lookupWithIpApi(ip, timeoutMs) {
  const data = await fetchJson(
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,region,regionName,country,countryCode,zip,lat,lon,timezone`,
    timeoutMs,
  )
  if (!data || data.status !== 'success') return null
  return normalizeResult({
    city: data.city,
    region: data.regionName || data.region,
    regionCode: data.region,
    country: data.country,
    countryCode: data.countryCode,
    zip: data.zip,
    latitude: data.lat,
    longitude: data.lon,
    timezone: data.timezone,
  })
}

async function lookupWithIpWho(ip, timeoutMs) {
  const data = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`, timeoutMs)
  if (!data || !data.success) return null
  return normalizeResult({
    city: data.city,
    region: data.region,
    regionCode: data.region_code,
    country: data.country,
    countryCode: data.country_code,
    zip: data.postal,
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone?.id ?? null,
  })
}

/** Prefer the answer with coordinates, then the more specific city name. */
function pickBest(a, b) {
  if (!a) return b
  if (!b) return a

  const aMapped = a.latitude != null && a.longitude != null
  const bMapped = b.latitude != null && b.longitude != null
  if (aMapped !== bMapped) return aMapped ? a : b

  const aCity = a.city || ''
  const bCity = b.city || ''
  if (NYC_BOROUGHS.has(aCity) !== NYC_BOROUGHS.has(bCity)) {
    return NYC_BOROUGHS.has(aCity) ? a : b
  }
  if (aCity.length !== bCity.length) return aCity.length > bCity.length ? a : b
  return a
}

/**
 * Resolve coordinates and a location label for a public IP. Returns null for
 * private/unroutable addresses and when both providers fail, so callers can
 * distinguish "no location" from "outside the fence".
 *
 * @param {string} ip
 * @param {{ timeoutMs?: number }} [opts]
 */
export async function lookupIpGeo(ip, opts = {}) {
  if (!ip || isPrivateIpValue(ip)) return null
  const timeoutMs = opts.timeoutMs ?? 3000
  const [fromIpApi, fromIpWho] = await Promise.all([
    lookupWithIpApi(ip, timeoutMs),
    lookupWithIpWho(ip, timeoutMs),
  ])
  return pickBest(fromIpApi, fromIpWho)
}
