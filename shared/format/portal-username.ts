/**
 * Derive a short portal username from a company / customer display name.
 * Examples: "Hollis Logistics" → "hollis", "ABC Trucking Co." → "abctruck"
 */

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'inc', 'llc', 'ltd', 'co', 'corp',
  'company', 'services', 'service', 'group', 'enterprises',
])

const MAX_USERNAME_LEN = 16
const MIN_USERNAME_LEN = 3

export function normalizePortalUsername(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, MAX_USERNAME_LEN)
}

/** Build a short username slug from a company display name (no uniqueness suffix). */
export function portalUsernameFromCompanyName(displayName: string): string {
  const words = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !STOP_WORDS.has(w))

  let base: string
  if (words.length === 0) {
    base = normalizePortalUsername(displayName) || 'customer'
  }
  else if (words.length === 1) {
    base = words[0]!
  }
  else {
    // Prefer first significant word; if very short, append start of next word.
    const first = words[0]!
    base = first.length >= 5
      ? first
      : first + words[1]!.slice(0, Math.max(2, 8 - first.length))
  }

  const normalized = normalizePortalUsername(base)
  if (normalized.length >= MIN_USERNAME_LEN) return normalized
  const padded = normalizePortalUsername(displayName + 'co')
  return (padded.length >= MIN_USERNAME_LEN ? padded : 'customer').slice(0, MAX_USERNAME_LEN)
}

/** Append numeric suffix until the candidate is unique (caller checks `isTaken`). */
export async function allocateUniquePortalUsername(
  displayName: string,
  isTaken: (username: string) => Promise<boolean>,
): Promise<string> {
  const base = portalUsernameFromCompanyName(displayName)
  if (!(await isTaken(base))) return base

  for (let n = 2; n < 1000; n++) {
    const suffix = String(n)
    const candidate = `${base.slice(0, MAX_USERNAME_LEN - suffix.length)}${suffix}`
    if (!(await isTaken(candidate))) return candidate
  }

  // Extremely unlikely collision path
  const fallback = `u${Date.now().toString(36)}`.slice(0, MAX_USERNAME_LEN)
  return fallback
}
