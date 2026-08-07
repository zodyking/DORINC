export const BILLING_PROVIDER_LABELS = {
  vultr: {
    name: 'Vultr',
    category: 'Web hosting',
  },
  cloudflare: {
    name: 'Cloudflare',
    category: 'Domain provider',
  },
  openrouter: {
    name: 'Susan',
    category: 'AI assistant (OpenRouter)',
  },
} as const

export type BillingProviderKey = keyof typeof BILLING_PROVIDER_LABELS

export const BILLING_PROVIDER_ACCOUNT_URLS: Record<BillingProviderKey, string> = {
  vultr: 'https://my.vultr.com/',
  cloudflare: 'https://dash.cloudflare.com/',
  openrouter: 'https://openrouter.ai/settings/credits',
}

export function billingProviderManageLabel(provider: BillingProviderKey): string {
  return `Manage ${BILLING_PROVIDER_LABELS[provider].name} account`
}

export function billingMoney(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

/**
 * Format tiny AI usage costs without collapsing sub-cent values to $0.00.
 * Keeps at least 2 decimals; expands up to 6 when needed.
 */
export function billingAiMoney(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  const fractionDigits = abs > 0 && abs < 0.01 ? 6 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function billingTokens(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US').format(value)
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

export function formatVultrMonthlyCost(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${billingMoney(value)}/month`
}

export function formatCloudflarePrivacy(mode: string | null | undefined): string {
  if (!mode) return '—'
  if (mode === 'redaction') return 'WHOIS redaction'
  return formatVultrInstanceStatus(mode)
}

export function formatYesNo(value: boolean | null | undefined): string {
  if (value == null) return '—'
  return value ? 'Yes' : 'No'
}

export interface BillingChartGeometry {
  width: number
  height: number
  padX: number
  padY: number
  maxValue: number
  actualPath: string
  projectedPath: string
  areaPath: string
  yTicks: Array<{ y: number, label: string, value: number }>
  points: Array<{
    x: number
    yActual: number | null
    yProjected: number | null
    label: string
    actualUsd: number | null
    projectedUsd: number | null
  }>
}

function niceChartMax(rawMax: number): number {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return 1
  const padded = rawMax * 1.12
  const magnitude = 10 ** Math.floor(Math.log10(padded))
  const step = magnitude >= 10 ? magnitude / 2 : magnitude
  return Math.ceil(padded / step) * step
}

export function buildBillingChartGeometry(
  points: Array<{ label: string, actualUsd: number | null, projectedUsd: number | null }>,
  width = 640,
  height = 220,
): BillingChartGeometry {
  const padX = 44
  const padY = 24
  const values = points.flatMap(p => [p.actualUsd, p.projectedUsd]).filter((v): v is number => v != null)
  const maxValue = niceChartMax(Math.max(1, ...values))
  const innerW = width - padX * 2
  const innerH = height - padY * 2
  const step = points.length > 1 ? innerW / (points.length - 1) : 0

  const yFor = (value: number) => padY + innerH - (value / maxValue) * innerH

  const mapped = points.map((point, index) => {
    const x = padX + index * step
    const yActual = point.actualUsd == null ? null : yFor(point.actualUsd)
    const yProjected = point.projectedUsd == null ? null : yFor(point.projectedUsd)
    return {
      x,
      yActual,
      yProjected,
      label: point.label,
      actualUsd: point.actualUsd,
      projectedUsd: point.projectedUsd,
    }
  })

  const toPath = (key: 'yActual' | 'yProjected') => {
    const coords = mapped
      .filter(p => p[key] != null)
      .map(p => `${p.x},${p[key]}`)
    if (!coords.length) return ''
    return `M ${coords.join(' L ')}`
  }

  const projectedCoords = mapped.filter(p => p.yProjected != null)
  let areaPath = ''
  if (projectedCoords.length) {
    const first = projectedCoords[0]!
    const last = projectedCoords[projectedCoords.length - 1]!
    areaPath = `M ${first.x},${padY + innerH} L ${projectedCoords.map(p => `${p.x},${p.yProjected}`).join(' L ')} L ${last.x},${padY + innerH} Z`
  }

  const tickCount = 4
  const yTicks = Array.from({ length: tickCount }, (_, index) => {
    const value = (maxValue * index) / (tickCount - 1)
    return {
      value,
      y: yFor(value),
      label: value >= 100
        ? `$${Math.round(value)}`
        : `$${value.toFixed(value >= 10 ? 0 : 2)}`,
    }
  })

  return {
    width,
    height,
    padX,
    padY,
    maxValue,
    actualPath: toPath('yActual'),
    projectedPath: toPath('yProjected'),
    areaPath,
    yTicks,
    points: mapped,
  }
}
