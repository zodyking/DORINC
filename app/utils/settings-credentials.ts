/** Shown in password fields when credentials are already saved server-side. */
export const SAVED_PASSWORD_MASK = '••••••••••••'

export function isSavedPasswordMask(value: string): boolean {
  return value === SAVED_PASSWORD_MASK
}

export function passwordForSave(value: string, configured: boolean): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || isSavedPasswordMask(trimmed)) {
    return configured ? undefined : ''
  }
  return trimmed
}
