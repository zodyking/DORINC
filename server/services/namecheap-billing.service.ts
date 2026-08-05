const NAMECHEAP_PROD = 'https://api.namecheap.com/xml.response'
const NAMECHEAP_SANDBOX = 'https://api.sandbox.namecheap.com/xml.response'
const NAMECHEAP_FETCH_TIMEOUT_MS = 15_000

export interface NamecheapCredentials {
  apiUser: string
  apiKey: string
  username: string
  clientIp: string
  useSandbox: boolean
}

export interface NamecheapDomainRow {
  name: string
  expires: string
  autoRenew: boolean
  isPremium: boolean
  isExpired: boolean
}

const pricingCache = new Map<string, { price: number, at: number }>()
const PRICING_TTL_MS = 24 * 60 * 60 * 1000

function namecheapBaseUrl(useSandbox: boolean): string {
  return useSandbox ? NAMECHEAP_SANDBOX : NAMECHEAP_PROD
}

function parseXmlTagAttributes(xml: string, tagName: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = []
  const tagRe = new RegExp(`<${tagName}([^/>]*)/?>`, 'gi')
  let match: RegExpExecArray | null
  while ((match = tagRe.exec(xml)) !== null) {
    const attrs: Record<string, string> = {}
    const attrRe = /([\w:-]+)="([^"]*)"/g
    let attr: RegExpExecArray | null
    while ((attr = attrRe.exec(match[1] ?? '')) !== null) {
      attrs[attr[1]!] = attr[2]!
    }
    rows.push(attrs)
  }
  return rows
}

function assertNamecheapOk(xml: string): void {
  const statusMatch = xml.match(/<ApiResponse[^>]*Status="([^"]+)"/i)
  const status = statusMatch?.[1]?.toUpperCase()
  if (status === 'ERROR') {
    const err = xml.match(/<Error[^>]*>([^<]+)<\/Error>/i)?.[1]
    throw new Error(err?.trim() || 'Namecheap API error')
  }
}

async function namecheapRequest(creds: NamecheapCredentials, params: Record<string, string>): Promise<string> {
  const url = new URL(namecheapBaseUrl(creds.useSandbox))
  url.searchParams.set('ApiUser', creds.apiUser)
  url.searchParams.set('ApiKey', creds.apiKey)
  url.searchParams.set('UserName', creds.username)
  url.searchParams.set('ClientIp', creds.clientIp)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  let res: Response
  try {
    res = await fetch(url.toString(), { signal: AbortSignal.timeout(NAMECHEAP_FETCH_TIMEOUT_MS) })
  }
  catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('Namecheap API timed out — check credentials, whitelisted IP, and network access', { cause: err })
    }
    throw err
  }
  if (!res.ok) throw new Error(`Namecheap API returned ${res.status}`)
  const xml = await res.text()
  assertNamecheapOk(xml)
  return xml
}

export async function fetchNamecheapDomains(creds: NamecheapCredentials): Promise<NamecheapDomainRow[]> {
  const domains: NamecheapDomainRow[] = []
  let page = 1
  const pageSize = 100

  while (page <= 20) {
    const xml = await namecheapRequest(creds, {
      Command: 'namecheap.domains.getList',
      PageSize: String(pageSize),
      Page: String(page),
    })
    const batch = parseXmlTagAttributes(xml, 'Domain').map(attrs => ({
      name: attrs.Name ?? '',
      expires: attrs.Expires ?? '',
      autoRenew: (attrs.AutoRenew ?? '').toLowerCase() === 'true',
      isPremium: (attrs.IsPremium ?? '').toLowerCase() === 'true',
      isExpired: (attrs.IsExpired ?? '').toLowerCase() === 'true',
    })).filter(row => row.name)

    domains.push(...batch)
    if (batch.length < pageSize) break
    page += 1
  }

  return domains
}

export function domainTld(domain: string): string {
  const parts = domain.toLowerCase().split('.')
  if (parts.length < 2) return parts[0]?.toUpperCase() ?? 'COM'
  return parts[parts.length - 1]!.toUpperCase()
}

export async function fetchNamecheapRenewalPrice(
  creds: NamecheapCredentials,
  tld: string,
): Promise<number | null> {
  const key = `${creds.useSandbox ? 'sandbox' : 'prod'}:${tld}`
  const cached = pricingCache.get(key)
  if (cached && Date.now() - cached.at < PRICING_TTL_MS) return cached.price

  const xml = await namecheapRequest(creds, {
    Command: 'namecheap.users.getPricing',
    ProductType: 'DOMAIN',
    ProductCategory: 'DOMAINS',
    ActionName: 'RENEW',
    ProductName: tld.toUpperCase(),
  })

  const priceRows = parseXmlTagAttributes(xml, 'Price')
  const oneYear = priceRows.find(row =>
    row.Duration === '1' && (row.DurationType ?? 'YEAR').toUpperCase() === 'YEAR',
  ) ?? priceRows[0]

  const price = oneYear?.Price != null ? Number(oneYear.Price) : NaN
  if (!Number.isFinite(price)) return null
  pricingCache.set(key, { price, at: Date.now() })
  return price
}

export function parseNamecheapExpiry(expires: string): Date | null {
  const m = expires.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const month = Number(m[1]) - 1
  const day = Number(m[2])
  const year = Number(m[3])
  const date = new Date(Date.UTC(year, month, day))
  return Number.isNaN(date.getTime()) ? null : date
}

export async function testNamecheapConnection(creds: NamecheapCredentials): Promise<{ ok: true, domainCount: number }> {
  const domains = await fetchNamecheapDomains(creds)
  return { ok: true, domainCount: domains.length }
}

export function clearNamecheapPricingCacheForTests(): void {
  pricingCache.clear()
}
