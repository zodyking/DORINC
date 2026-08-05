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
  region: string
  plan: string
  status: string
  mainIp: string | null
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
  return (payload.instances ?? []).map(row => ({
    id: String(row.id ?? ''),
    label: String(row.label ?? 'Server'),
    region: String(row.region ?? ''),
    plan: String(row.plan ?? ''),
    status: String(row.status ?? row.power_status ?? 'unknown'),
    mainIp: row.main_ip ? String(row.main_ip) : null,
  }))
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
