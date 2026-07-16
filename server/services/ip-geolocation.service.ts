const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^localhost$/i,
]

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

interface IpWhoResponse {
  success?: boolean
  city?: string
  region?: string
  region_code?: string
  country?: string
  country_code?: string
  connection?: {
    org?: string
    isp?: string
  }
}

interface IpApiResponse {
  status?: string
  city?: string
  region?: string
  regionName?: string
  country?: string
  countryCode?: string
  isp?: string
  org?: string
}

export interface IpLocationResult {
  label: string
  network?: string | null
}

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip))
}

/** Normalize forwarded / IPv6-mapped client IPs before lookup. */
export function normalizeClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  let cleaned = ip.trim()
  if (!cleaned) return null

  if (cleaned.includes(',')) {
    cleaned = cleaned.split(',')[0]?.trim() ?? ''
  }

  if (cleaned.startsWith('::ffff:')) {
    cleaned = cleaned.slice('::ffff:'.length)
  }

  if (/^\[.+\](:\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/^\[(.+)\](?::\d+)?$/, '$1')
  }
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(cleaned)) {
    cleaned = cleaned.split(':')[0] ?? cleaned
  }

  return cleaned || null
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

function formatLocationParts(parts: {
  city?: string | null
  region?: string | null
  regionCode?: string | null
  country?: string | null
  countryCode?: string | null
}): string | null {
  const city = parts.city?.trim()
  if (!city) return null

  const region = abbreviateRegion(parts.region || '', parts.regionCode || undefined, parts.countryCode || undefined)
  const country = parts.country?.trim()
  const countryCode = parts.countryCode?.trim()

  const segments = [city]
  if (region) segments.push(region)
  if (country && countryCode && countryCode !== 'US') {
    segments.push(country)
  }
  else if (country && !countryCode) {
    segments.push(country)
  }

  return segments.join(', ')
}

function formatNetwork(org?: string | null, isp?: string | null): string | null {
  const primary = org?.trim() || isp?.trim()
  if (!primary) return null
  const secondary = org?.trim() && isp?.trim() && org.trim() !== isp.trim() ? isp.trim() : null
  return secondary ? `${primary} (${secondary})` : primary
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

async function lookupWithIpWho(ip: string): Promise<IpLocationResult | null> {
  const data = await fetchJson<IpWhoResponse>(`https://ipwho.is/${encodeURIComponent(ip)}`, 3000)
  if (!data?.success) return null

  const label = formatLocationParts({
    city: data.city,
    region: data.region,
    regionCode: data.region_code,
    country: data.country,
    countryCode: data.country_code,
  })
  if (!label) return null

  return {
    label,
    network: formatNetwork(data.connection?.org, data.connection?.isp),
  }
}

async function lookupWithIpApi(ip: string): Promise<IpLocationResult | null> {
  const data = await fetchJson<IpApiResponse>(
    `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,region,regionName,country,countryCode,isp,org`,
    3000,
  )
  if (data?.status !== 'success' || !data.city) return null

  const label = formatLocationParts({
    city: data.city,
    region: data.regionName || data.region,
    regionCode: data.region,
    country: data.country,
    countryCode: data.countryCode,
  })
  if (!label) return null

  return {
    label,
    network: formatNetwork(data.org, data.isp),
  }
}

/** Resolve a human-readable location label for a public IP address. */
export async function resolveIpLocation(ip: string | null | undefined): Promise<string | null> {
  const normalized = normalizeClientIp(ip)
  if (!normalized || isPrivateIp(normalized)) return null

  const fromIpWho = await lookupWithIpWho(normalized)
  if (fromIpWho) {
    return fromIpWho.network ? `${fromIpWho.label} · ${fromIpWho.network}` : fromIpWho.label
  }

  const fromIpApi = await lookupWithIpApi(normalized)
  if (fromIpApi) {
    return fromIpApi.network ? `${fromIpApi.label} · ${fromIpApi.network}` : fromIpApi.label
  }

  return null
}
