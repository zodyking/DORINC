/** Strip to digits; drop leading US country code when present. */
function usPhoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
  return null
}

/**
 * Format a phone number for display as `(xxx) xxx xxxx`.
 * Non-US or non-standard lengths are returned trimmed unchanged.
 */
export function formatPhoneDisplay(value: string | null | undefined): string {
  if (value == null) return ''
  const trimmed = String(value).trim()
  if (!trimmed || trimmed === '—' || trimmed === '-') return trimmed

  const local = usPhoneDigits(trimmed)
  if (local) {
    return `(${local.slice(0, 3)}) ${local.slice(3, 6)} ${local.slice(6)}`
  }

  return trimmed
}

/** Display helper — empty values render as em dash. */
export function phoneDisplay(value: string | null | undefined): string {
  return formatPhoneDisplay(value) || '—'
}
