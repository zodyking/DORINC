/** Currency text input helpers — type cents first, display as dollars. */

export function normalizeCurrencyDisplay(value: string | number | null | undefined): string {
  if (value == null || value === '') return '0.00'
  const raw = String(value).trim().replace(/[^0-9.-]/g, '')
  if (!raw || raw === '-' || raw === '.') return '0.00'
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed) || parsed < 0) return '0.00'
  return (Math.round(parsed * 100) / 100).toFixed(2)
}

export function currencyToCents(value: string | number | null | undefined): number {
  const normalized = normalizeCurrencyDisplay(value)
  return Math.round(Number.parseFloat(normalized) * 100)
}

export function centsToCurrency(cents: number): string {
  const safe = Math.max(0, Math.min(cents, 9999999999))
  return (safe / 100).toFixed(2)
}

export function appendCurrencyDigit(current: string, digit: string): string {
  if (!/^\d$/.test(digit)) return normalizeCurrencyDisplay(current)
  const cents = currencyToCents(current)
  const next = Math.min(cents * 10 + Number.parseInt(digit, 10), 9999999999)
  return centsToCurrency(next)
}

export function backspaceCurrency(current: string): string {
  const cents = currencyToCents(current)
  return centsToCurrency(Math.floor(cents / 10))
}

export function parseCurrencyInput(text: string): string {
  const digits = text.replace(/\D/g, '')
  if (!digits) return '0.00'
  const cents = Math.min(Number.parseInt(digits, 10), 9999999999)
  return centsToCurrency(cents)
}
