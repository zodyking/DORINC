import { formatLocationParts } from './ip-geolocation.service'

export interface BrowserGeoInput {
  latitude: number
  longitude: number
  accuracyM?: number | null
}

interface NominatimAddress {
  city?: string
  town?: string
  village?: string
  hamlet?: string
  suburb?: string
  borough?: string
  neighbourhood?: string
  county?: string
  state?: string
  postcode?: string
  country_code?: string
}

interface NominatimReverseResponse {
  address?: NominatimAddress
}

function pickCity(address: NominatimAddress | undefined): string {
  if (!address) return ''
  return (
    address.city
    || address.town
    || address.village
    || address.hamlet
    || address.suburb
    || address.borough
    || address.neighbourhood
    || ''
  ).trim()
}

async function fetchJson<T>(url: string, timeoutMs: number, init?: RequestInit): Promise<T | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    clearTimeout(timeoutId)
    if (!res.ok) return null
    return await res.json() as T
  }
  catch {
    clearTimeout(timeoutId)
    return null
  }
}

/** Reverse-geocode browser GPS coordinates into a city/state label. */
export async function resolveBrowserLocation(geo: BrowserGeoInput): Promise<string | null> {
  const lat = geo.latitude
  const lon = geo.longitude
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'json')
  url.searchParams.set('lat', String(lat))
  url.searchParams.set('lon', String(lon))
  url.searchParams.set('zoom', '14')
  url.searchParams.set('addressdetails', '1')

  const data = await fetchJson<NominatimReverseResponse>(url.toString(), 4000, {
    headers: {
      'User-Agent': 'DORINC/1.0 (staff sign-in alerts)',
    },
  })

  const address = data?.address
  const city = pickCity(address)
  if (!city) return null

  return formatLocationParts({
    city,
    region: address?.state,
    regionCode: address?.state,
    countryCode: address?.country_code?.toUpperCase(),
    zip: address?.postcode,
  })
}
