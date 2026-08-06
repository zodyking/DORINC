const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4'
const CLOUDFLARE_FETCH_TIMEOUT_MS = 15_000

export type CloudflarePrivacyMode = 'redaction' | string
export type CloudflareRegistrationStatus =
  | 'active'
  | 'registration_pending'
  | 'expired'
  | 'suspended'
  | 'redemption_period'
  | 'pending_delete'
  | string

export interface CloudflareRegistrationRow {
  domainName: string
  expiresAt: string | null
  registeredAt: string | null
  autoRenew: boolean
  locked: boolean
  status: CloudflareRegistrationStatus
  privacyMode: CloudflarePrivacyMode | null
  renewalCost: number | null
  currency: string
}

interface CloudflareApiEnvelope<T> {
  success?: boolean
  errors?: Array<{ code?: number, message?: string }>
  result?: T
  result_info?: {
    count?: number
    cursor?: string
    per_page?: number
    page?: number
    total_count?: number
  }
}

function cloudflareErrorMessage(payload: CloudflareApiEnvelope<unknown> | null, status: number): string {
  const first = payload?.errors?.[0]?.message
  if (first) return first
  return `Cloudflare API returned ${status}`
}

async function cloudflareFetch<T>(
  apiToken: string,
  path: string,
  init?: RequestInit,
): Promise<CloudflareApiEnvelope<T>> {
  let res: Response
  try {
    res = await fetch(`${CLOUDFLARE_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(CLOUDFLARE_FETCH_TIMEOUT_MS),
    })
  }
  catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('Cloudflare API timed out — check your API token and network access', { cause: err })
    }
    throw err
  }

  const payload = await res.json().catch(() => null) as CloudflareApiEnvelope<T> | null
  if (!res.ok || payload?.success === false) {
    throw new Error(cloudflareErrorMessage(payload, res.status))
  }
  return payload ?? { success: true, result: undefined as T }
}

export function extractDomainExtension(domainName: string): string | null {
  const parts = domainName.trim().toLowerCase().split('.').filter(Boolean)
  if (parts.length < 2) return null
  return parts.slice(1).join('.')
}

export function mapCloudflareRegistration(
  row: Record<string, unknown>,
  renewalCost: number | null = null,
  currency = 'USD',
): CloudflareRegistrationRow | null {
  const domainName = String(row.domain_name ?? row.name ?? '').trim().toLowerCase()
  if (!domainName) return null
  return {
    domainName,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    registeredAt: row.created_at ? String(row.created_at) : (row.registry_created_at ? String(row.registry_created_at) : null),
    autoRenew: Boolean(row.auto_renew),
    locked: Boolean(row.locked),
    status: String(row.status ?? 'unknown'),
    privacyMode: row.privacy_mode != null ? String(row.privacy_mode) : null,
    renewalCost,
    currency,
  }
}

export function daysUntilIso(dateIso: string | null, now = Date.now()): number | null {
  if (!dateIso) return null
  const ms = new Date(dateIso).getTime() - now
  if (Number.isNaN(ms)) return null
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

/**
 * Best-effort TLD renewal pricing via domain-search.
 * Cloudflare does not expose renewal fees on owned registrations yet;
 * search pricing for a registrable name on the same extension is the
 * closest documented source for renewal_cost.
 */
export async function estimateExtensionRenewalCost(
  apiToken: string,
  accountId: string,
  extension: string,
): Promise<{ renewalCost: number, currency: string } | null> {
  const query = `dorinc-probe-${Date.now().toString(36)}`
  const path = `/accounts/${encodeURIComponent(accountId)}/registrar/domain-search?q=${encodeURIComponent(query)}`
  try {
    const payload = await cloudflareFetch<{ domains?: Array<Record<string, unknown>> }>(apiToken, path)
    const domains = payload.result?.domains ?? []
    const needle = `.${extension.toLowerCase()}`
    for (const domain of domains) {
      const name = String(domain.name ?? '').toLowerCase()
      if (!name.endsWith(needle)) continue
      const pricing = domain.pricing as Record<string, unknown> | undefined
      if (!pricing) continue
      const renewalCost = Number(pricing.renewal_cost ?? pricing.registration_cost)
      if (!Number.isFinite(renewalCost) || renewalCost < 0) continue
      return {
        renewalCost: Math.round(renewalCost * 100) / 100,
        currency: String(pricing.currency ?? 'USD'),
      }
    }
  }
  catch {
    return null
  }
  return null
}

export async function fetchCloudflareRegistrations(
  apiToken: string,
  accountId: string,
): Promise<CloudflareRegistrationRow[]> {
  const rows: CloudflareRegistrationRow[] = []
  let cursor = ''

  do {
    const params = new URLSearchParams({
      per_page: '50',
      sort_by: 'registry_expires_at',
      direction: 'asc',
    })
    if (cursor) params.set('cursor', cursor)
    const path = `/accounts/${encodeURIComponent(accountId)}/registrar/registrations?${params}`
    const payload = await cloudflareFetch<Array<Record<string, unknown>>>(apiToken, path)
    const page = Array.isArray(payload.result) ? payload.result : []
    for (const item of page) {
      const mapped = mapCloudflareRegistration(item)
      if (mapped) rows.push(mapped)
    }
    cursor = String(payload.result_info?.cursor ?? '')
  } while (cursor)

  const extensionCosts = new Map<string, { renewalCost: number, currency: string }>()
  for (const row of rows) {
    const extension = extractDomainExtension(row.domainName)
    if (!extension || extensionCosts.has(extension)) continue
    const estimate = await estimateExtensionRenewalCost(apiToken, accountId, extension)
    if (estimate) extensionCosts.set(extension, estimate)
  }

  return rows.map((row) => {
    const extension = extractDomainExtension(row.domainName)
    const estimate = extension ? extensionCosts.get(extension) : undefined
    return {
      ...row,
      renewalCost: estimate?.renewalCost ?? null,
      currency: estimate?.currency ?? 'USD',
    }
  })
}

export async function testCloudflareConnection(
  apiToken: string,
  accountId: string,
): Promise<{ ok: true, domainCount: number }> {
  let cursor = ''
  let domainCount = 0
  do {
    const params = new URLSearchParams({
      per_page: '50',
      sort_by: 'name',
      direction: 'asc',
    })
    if (cursor) params.set('cursor', cursor)
    const path = `/accounts/${encodeURIComponent(accountId)}/registrar/registrations?${params}`
    const payload = await cloudflareFetch<Array<Record<string, unknown>>>(apiToken, path)
    domainCount += Array.isArray(payload.result) ? payload.result.length : 0
    cursor = String(payload.result_info?.cursor ?? '')
  } while (cursor)
  return { ok: true, domainCount }
}

export function sumCloudflareRenewalsInWindow(
  domains: Array<{ daysUntilRenewal: number | null, renewalCost: number | null }>,
  maxDays: number,
): number {
  let total = 0
  for (const domain of domains) {
    if (domain.daysUntilRenewal == null || domain.renewalCost == null) continue
    if (domain.daysUntilRenewal < 0 || domain.daysUntilRenewal > maxDays) continue
    total += domain.renewalCost
  }
  return Math.round(total * 100) / 100
}
