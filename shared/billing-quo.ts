/**
 * Quo prepaid cost is a monthly recurring bill.
 * Control Panel stores an anchor payment day + monthly amount; billing rolls
 * a past anchor forward to the next calendar due date.
 */

function parseUtcYmd(value: string): { year: number, month: number, day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return { year, month, day }
}

function utcYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Days in a UTC month (month is 1-12). */
function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInUtcMonth(year, month))
}

function todayUtcYmd(now = new Date()): string {
  return utcYmd(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())
}

/**
 * Given an anchor payment date (YYYY-MM-DD), return the next monthly due date
 * on or after today (UTC). Past anchors advance one calendar month at a time,
 * clamping the day when the target month is shorter (e.g. Jan 31 → Feb 28).
 */
export function nextQuoPaymentDate(
  anchorDate: string | null | undefined,
  now = new Date(),
): string | null {
  const parsed = typeof anchorDate === 'string' ? parseUtcYmd(anchorDate.trim()) : null
  if (!parsed) return null

  const today = todayUtcYmd(now)
  let year = parsed.year
  let month = parsed.month
  const anchorDay = parsed.day

  // Safety cap — never loop more than ~20 years of monthly advances.
  for (let i = 0; i < 240; i += 1) {
    const day = clampDay(year, month, anchorDay)
    const candidate = utcYmd(year, month, day)
    if (candidate >= today) return candidate
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }

  return utcYmd(year, month, clampDay(year, month, anchorDay))
}

/** Whole days until a YYYY-MM-DD (UTC), negative when overdue. */
export function daysUntilQuoPaymentDate(
  paymentDate: string | null | undefined,
  now = new Date(),
): number | null {
  const parsed = typeof paymentDate === 'string' ? parseUtcYmd(paymentDate.trim()) : null
  if (!parsed) return null
  const due = Date.UTC(parsed.year, parsed.month - 1, parsed.day)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.round((due - today) / (24 * 60 * 60 * 1000))
}

export function quoMonthlyRecurringUsd(amount: number | null | undefined): number {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return 0
  return Math.round(amount * 100) / 100
}

export function quoYearlyRecurringUsd(amount: number | null | undefined): number {
  return Math.round(quoMonthlyRecurringUsd(amount) * 12 * 100) / 100
}
