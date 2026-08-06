/** Normalize pasted OpenRouter keys (strip Bearer, whitespace/newlines). */
export function normalizeOpenRouterApiKey(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/\s+/g, '')
}

export function isOpenRouterAuthErrorMessage(message: string | null | undefined): boolean {
  const text = (message ?? '').trim().toLowerCase()
  if (!text) return false
  return (
    text.includes('missing authentication header')
    || text.includes('no auth credentials')
    || text.includes('unauthorized')
    || text.includes('invalid api key')
    || text.includes('invalid token')
    || text.includes('user not found')
    || text.includes('authentication failed')
  )
}

export function openRouterAuthRecoveryMessage(): string {
  return 'OpenRouter authentication failed. Re-paste your OpenRouter API key in Control Panel → AI (and the management key under Billing if you use credits), then save.'
}
