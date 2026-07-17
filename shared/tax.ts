/** Convert a display percent like "6.6" to decimal rate "0.066000" for rateOfMoney. */
export function taxRatePercentToDecimal(percent: string | null | undefined): string {
  const raw = String(percent ?? '').trim()
  if (!raw) return '0'
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return '0'
  return (parsed / 100).toFixed(6)
}

/** Format decimal rate for display e.g. "0.066000" → "6.6%". */
export function formatTaxRatePercent(decimalRate: string | null | undefined): string {
  const raw = String(decimalRate ?? '').trim()
  if (!raw || raw === '0') return '0%'
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return '0%'
  const pct = parsed * 100
  const rounded = Math.round(pct * 100) / 100
  return `${rounded}%`
}
