export function pgErrorCause(err: unknown): { code?: string, constraint?: string, message?: string } | null {
  if (!err || typeof err !== 'object') return null
  const cause = (err as { cause?: { code?: string, constraint?: string, message?: string } }).cause
  return cause ?? null
}

export function isPgUniqueViolation(err: unknown, constraint?: string): boolean {
  const cause = pgErrorCause(err)
  if (cause?.code !== '23505') return false
  if (constraint && cause.constraint !== constraint) return false
  return true
}
