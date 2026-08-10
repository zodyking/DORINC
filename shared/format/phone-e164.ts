/** Normalize user-entered phones toward E.164 for Quo SMS (US/CA default +1). */

export function normalizePhoneE164(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed

  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return null
}

export function isValidPhoneE164(value: string | null | undefined): boolean {
  return normalizePhoneE164(value) != null
}
