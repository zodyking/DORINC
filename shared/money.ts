/**
 * Money arithmetic in integer cents — never use JS floats for invoice totals.
 * Values round-trip as decimal strings suitable for numeric(12,2).
 */

const MONEY_RE = /^(-?\d{1,10})(?:\.(\d{1,2}))?$/

export function parseMoney(value: string): bigint {
  const match = MONEY_RE.exec(value.trim())
  if (!match) throw new Error(`Invalid money value: ${value}`)
  const negative = match[1]!.startsWith('-')
  const whole = BigInt(negative ? match[1]!.slice(1) : match[1]!)
  const frac = BigInt((match[2] ?? '0').padEnd(2, '0').slice(0, 2))
  const cents = whole * 100n + frac
  return negative ? -cents : cents
}

export function formatMoney(cents: bigint): string {
  const negative = cents < 0n
  const abs = negative ? -cents : cents
  const whole = abs / 100n
  const frac = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${frac}`
}

/** Format a decimal money string for display in emails and UI (adds $ when missing). */
export function formatMoneyForDisplay(value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null
  const trimmed = value.trim()
  if (trimmed.startsWith('$')) return trimmed
  try {
    return `$${formatMoney(parseMoney(trimmed))}`
  }
  catch {
    return trimmed
  }
}

function roundHalfUp(dividend: bigint, divisor: bigint): bigint {
  if (divisor === 0n) throw new Error('Division by zero')
  const adjust = dividend >= 0n ? divisor / 2n : -(divisor / 2n)
  return (dividend + adjust) / divisor
}

/** Parse a quantity or percentage string (up to 4 decimal places). */
function parseScaled(value: string, scale: bigint): bigint {
  const trimmed = value.trim()
  const negative = trimmed.startsWith('-')
  const normalized = negative ? trimmed.slice(1) : trimmed
  const [whole = '0', frac = ''] = normalized.split('.')
  const fracDigits = (frac + '0000').slice(0, 4)
  const scaled = BigInt(whole) * scale + BigInt(fracDigits) * (scale / 10000n)
  return negative ? -scaled : scaled
}

export function multiplyMoney(quantity: string, unitPrice: string): string {
  const qtyScaled = parseScaled(quantity, 10000n)
  const priceCents = parseMoney(unitPrice)
  const cents = roundHalfUp(qtyScaled * priceCents, 10000n)
  return formatMoney(cents)
}

export function addMoney(...values: string[]): string {
  const sum = values.reduce((acc, v) => acc + parseMoney(v), 0n)
  return formatMoney(sum)
}

export function subtractMoney(minuend: string, subtrahend: string): string {
  return formatMoney(parseMoney(minuend) - parseMoney(subtrahend))
}

/** Apply a percentage like "3.5" to a money base. */
export function percentOfMoney(base: string, percent: string): string {
  const baseCents = parseMoney(base)
  const pctScaled = parseScaled(percent, 10000n)
  const cents = roundHalfUp(baseCents * pctScaled, 1000000n)
  return formatMoney(cents)
}

/** Apply a decimal tax rate like "0.066000" to a taxable base. */
export function rateOfMoney(base: string, rate: string): string {
  const baseCents = parseMoney(base)
  const rateScaled = parseScaled(rate, 1000000n)
  const cents = roundHalfUp(baseCents * rateScaled, 1000000n)
  return formatMoney(cents)
}

export function maxMoney(a: string, b: string): string {
  return parseMoney(a) >= parseMoney(b) ? a : b
}

export function isZeroMoney(value: string): boolean {
  return parseMoney(value) === 0n
}

/** Compare two money strings. Returns negative if a < b, 0 if equal, positive if a > b. */
export function compareMoney(a: string, b: string): number {
  const diff = parseMoney(a) - parseMoney(b)
  if (diff < 0n) return -1
  if (diff > 0n) return 1
  return 0
}
