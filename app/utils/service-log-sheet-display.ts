import { formatMoney, parseMoney } from '#shared/money'

/** Client-side price label matching the printable sheet ($35 / $1,600). */
export function formatSheetPriceDisplay(value: string | null | undefined): string {
  if (value == null || value.trim() === '') return '—'
  const trimmed = value.trim()
  try {
    const cents = parseMoney(trimmed.startsWith('$') ? trimmed.slice(1) : trimmed)
    const negative = cents < 0n
    const abs = negative ? -cents : cents
    const whole = abs / 100n
    const frac = abs % 100n
    const withCommas = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const sign = negative ? '-' : ''
    if (frac === 0n) return `$${sign}${withCommas}`
    return `$${sign}${withCommas}.${frac.toString().padStart(2, '0')}`
  }
  catch {
    try {
      return `$${formatMoney(parseMoney(trimmed))}`
    }
    catch {
      return trimmed.startsWith('$') ? trimmed : `$${trimmed}`
    }
  }
}
