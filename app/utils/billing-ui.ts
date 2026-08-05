export const BILLING_PROVIDER_LABELS = {
  vultr: {
    name: 'Vultr',
    category: 'Web hosting',
  },
  namecheap: {
    name: 'Namecheap',
    category: 'Domain provider',
  },
  openrouter: {
    name: 'OpenRouter',
    category: 'Artificial intelligence',
  },
} as const

export type BillingProviderKey = keyof typeof BILLING_PROVIDER_LABELS

export const BILLING_PROVIDER_ACCOUNT_URLS: Record<BillingProviderKey, string> = {
  vultr: 'https://my.vultr.com/',
  namecheap: 'https://www.namecheap.com/myaccount/login/',
  openrouter: 'https://openrouter.ai/settings/credits',
}

export function billingProviderManageLabel(provider: BillingProviderKey): string {
  return `Manage ${BILLING_PROVIDER_LABELS[provider].name} account`
}

export function billingMoney(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export function billingDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString()
}

export function billingDateTime(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function billingProviderStatus(configured: boolean, hasError: boolean): { label: string, class: string } {
  if (hasError) return { label: 'Error', class: 'danger' }
  if (configured) return { label: 'Connected', class: 'ok' }
  return { label: 'Not set up', class: 'muted' }
}

export function billingDaysBadgeClass(days: number): string {
  if (days < 0) return 'danger'
  if (days <= 30) return 'warn'
  if (days <= 90) return 'amber'
  return 'ok'
}

export function formatVultrInstanceStatus(status: string): string {
  const value = status.trim()
  if (!value) return 'Unknown'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

export function formatVultrCount(value: number | null, unit: string): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (unit === 'vCPU') return value === 1 ? '1 vCPU' : `${value} vCPUs`
  return `${value} ${unit}`
}

export function formatVultrRam(mb: number | null): string {
  if (mb == null || Number.isNaN(mb)) return '—'
  if (mb >= 1024) {
    const gb = mb / 1024
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB RAM`
  }
  return `${mb} MB RAM`
}

export function formatVultrDisk(gb: number | null): string {
  if (gb == null || Number.isNaN(gb)) return '—'
  return `${gb} GB disk`
}

export function formatVultrBandwidth(gb: number | null): string {
  if (gb == null || Number.isNaN(gb)) return '—'
  if (gb >= 1024) {
    const tb = gb / 1024
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB / month`
  }
  return `${gb} GB / month`
}

export function formatVultrFeatureList(values: string[]): string {
  if (!values.length) return '—'
  return values.map(value => formatVultrInstanceStatus(value)).join(', ')
}
