export interface IpGeoLookupResult {
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

export interface LocationParts {
  city?: string | null
  region?: string | null
  regionCode?: string | null
  country?: string | null
  countryCode?: string | null
  zip?: string | null
}

export function isPrivateIpValue(ip: string | null | undefined): boolean
export function formatLocationParts(parts: LocationParts): string | null
export function lookupIpGeo(
  ip: string | null | undefined,
  opts?: { timeoutMs?: number },
): Promise<IpGeoLookupResult | null>
