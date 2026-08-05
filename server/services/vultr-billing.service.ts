const VULTR_API = 'https://api.vultr.com/v2'
const VULTR_FETCH_TIMEOUT_MS = 15_000

export interface VultrAccountSummary {
  balance: number
  pendingCharges: number
  lastPaymentDate: string | null
  lastPaymentAmount: number | null
}

export interface VultrInstanceRow {
  id: string
  label: string
  hostname: string | null
  os: string | null
  region: string
  plan: string
  vcpuCount: number | null
  ramMb: number | null
  diskGb: number | null
  allowedBandwidthGb: number | null
  status: string
  powerStatus: string | null
  serverStatus: string | null
  mainIp: string | null
  v6MainIp: string | null
  internalIp: string | null
  gatewayV4: string | null
  dateCreated: string | null
  features: string[]
  tags: string[]
}

export interface VultrPlanPriceRow {
  id: string
  monthlyCost: number
}

export function mapVultrPlanPriceRow(row: Record<string, unknown>): VultrPlanPriceRow | null {
  const id = String(row.id ?? '').trim()
  if (!id) return null
  return {
    id,
    monthlyCost: Number(row.monthly_cost ?? 0),
  }
}

export function buildVultrPlanPriceMap(plans: VultrPlanPriceRow[]): Map<string, number> {
  return new Map(plans.map(plan => [plan.id, plan.monthlyCost]))
}

export function attachVultrInstancePlanCosts(
  instances: VultrInstanceRow[],
  planPrices: Map<string, number>,
): Array<VultrInstanceRow & { monthlyPlanCost: number | null }> {
  return instances.map(instance => ({
    ...instance,
    monthlyPlanCost: planPrices.has(instance.plan) ? planPrices.get(instance.plan)! : null,
  }))
}

export function sumVultrMonthlyPlanCost(
  instances: Array<{ monthlyPlanCost: number | null }>,
): number | null {
  if (!instances.length) return null
  let total = 0
  let priced = false
  for (const instance of instances) {
    if (instance.monthlyPlanCost == null) continue
    total += instance.monthlyPlanCost
    priced = true
  }
  return priced ? total : null
}

export function mapVultrInstanceRow(row: Record<string, unknown>): VultrInstanceRow {
  const features = Array.isArray(row.features) ? row.features.map(String) : []
  const tags = Array.isArray(row.tags) ? row.tags.map(String) : []
  return {
    id: String(row.id ?? ''),
    label: String(row.label ?? 'Server'),
    hostname: row.hostname ? String(row.hostname) : null,
    os: row.os ? String(row.os) : null,
    region: String(row.region ?? ''),
    plan: String(row.plan ?? ''),
    vcpuCount: row.vcpu_count != null ? Number(row.vcpu_count) : null,
    ramMb: row.ram != null ? Number(row.ram) : null,
    diskGb: row.disk != null ? Number(row.disk) : null,
    allowedBandwidthGb: row.allowed_bandwidth != null ? Number(row.allowed_bandwidth) : null,
    status: String(row.status ?? 'unknown'),
    powerStatus: row.power_status ? String(row.power_status) : null,
    serverStatus: row.server_status ? String(row.server_status) : null,
    mainIp: row.main_ip ? String(row.main_ip) : null,
    v6MainIp: row.v6_main_ip ? String(row.v6_main_ip) : null,
    internalIp: row.internal_ip ? String(row.internal_ip) : null,
    gatewayV4: row.gateway_v4 ? String(row.gateway_v4) : null,
    dateCreated: row.date_created ? String(row.date_created) : null,
    features,
    tags,
  }
}

export interface VultrBillingHistoryRow {
  id: string
  date: string
  amount: number
  description: string
}

async function vultrFetch<T>(apiKey: string, path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${VULTR_API}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(VULTR_FETCH_TIMEOUT_MS),
    })
  }
  catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('Vultr API timed out — check your API key and network access', { cause: err })
    }
    throw err
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(body || `Vultr API returned ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function fetchVultrAccount(apiKey: string): Promise<VultrAccountSummary> {
  const payload = await vultrFetch<{ account?: Record<string, unknown> }>(apiKey, '/account')
  const account = payload.account ?? {}
  return {
    balance: Number(account.balance ?? 0),
    pendingCharges: Number(account.pending_charges ?? 0),
    lastPaymentDate: account.last_payment_date ? String(account.last_payment_date) : null,
    lastPaymentAmount: account.last_payment_amount != null ? Number(account.last_payment_amount) : null,
  }
}

export async function fetchVultrInstances(apiKey: string): Promise<VultrInstanceRow[]> {
  const payload = await vultrFetch<{ instances?: Array<Record<string, unknown>> }>(apiKey, '/instances')
  return (payload.instances ?? []).map(mapVultrInstanceRow)
}

export async function fetchVultrPlanPriceMap(apiKey: string): Promise<Map<string, number>> {
  const payload = await vultrFetch<{ plans?: Array<Record<string, unknown>> }>(apiKey, '/plans?per_page=500')
  const plans = (payload.plans ?? [])
    .map(mapVultrPlanPriceRow)
    .filter((row): row is VultrPlanPriceRow => row != null)
  return buildVultrPlanPriceMap(plans)
}

export async function fetchVultrBillingHistory(apiKey: string, limit = 12): Promise<VultrBillingHistoryRow[]> {
  const payload = await vultrFetch<{ billing_history?: Array<Record<string, unknown>> }>(
    apiKey,
    `/billing/history?per_page=${limit}`,
  )
  return (payload.billing_history ?? []).map(row => ({
    id: String(row.id ?? row.transaction_id ?? ''),
    date: String(row.date ?? row.created_at ?? ''),
    amount: Number(row.amount ?? row.total ?? 0),
    description: String(row.description ?? row.type ?? 'Billing'),
  }))
}

export async function testVultrConnection(apiKey: string): Promise<{ ok: true, instanceCount: number }> {
  const [account, instances] = await Promise.all([
    fetchVultrAccount(apiKey),
    fetchVultrInstances(apiKey),
  ])
  void account
  return { ok: true, instanceCount: instances.length }
}
