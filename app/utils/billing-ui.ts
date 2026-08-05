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

export function billingMoney(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

export function billingDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString()
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
