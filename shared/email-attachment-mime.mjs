/** Shared MIME + inline-part helpers for inbound email attachments. */

export const GENERIC_ATTACHMENT_MIMES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/x-unknown-content-type',
])

const MIME_EQUIVALENTS = {
  'image/heic': ['image/heic', 'image/heif'],
  'image/heif': ['image/heic', 'image/heif'],
}

export function resolveAllowedAttachmentMime(declared, sniffed, allowed) {
  const normalized = String(declared || '').toLowerCase().split(';')[0].trim()
  if (!sniffed || !allowed.has(sniffed)) return null

  if (!normalized || GENERIC_ATTACHMENT_MIMES.has(normalized)) return sniffed

  const accepted = MIME_EQUIVALENTS[normalized] ?? [normalized]
  if (!allowed.has(normalized) || !accepted.includes(sniffed)) return null
  return sniffed
}

export function isInlineEmailPart(attachment) {
  const contentId = attachment?.cid ?? attachment?.contentId
  if (!String(contentId || '').trim()) return false
  if (attachment?.related) return true
  return String(attachment?.contentDisposition || '').toLowerCase().startsWith('inline')
}

export function resolveInlineImageMime(declared, sniffed, allowed) {
  const resolved = resolveAllowedAttachmentMime(declared, sniffed, allowed)
  return resolved?.startsWith('image/') ? resolved : null
}
