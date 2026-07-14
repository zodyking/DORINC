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

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(ip))
}

export async function resolveIpLocation(ip: string | null | undefined): Promise<string | null> {
  if (!ip || isPrivateIp(ip)) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 2500)

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName`,
      { signal: controller.signal },
    )
    clearTimeout(timeoutId)

    if (!res.ok) return null

    const data = await res.json() as {
      status?: string
      city?: string
      regionName?: string
    }

    if (data.status !== 'success' || !data.city) return null

    const city = data.city
    const region = data.regionName || ''
    return region ? `${city}, ${region}` : city
  }
  catch {
    clearTimeout(timeoutId)
    return null
  }
}
