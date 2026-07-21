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

/**
 * Non-image / non-PDF document attachment types accepted from inbound email.
 * These cannot be reliably magic-byte sniffed, so they are trusted by their
 * declared MIME or filename extension. Intentionally excludes types browsers
 * execute inline (html/svg/xml/js) since attachments are served download-only.
 */
export const DOCUMENT_ATTACHMENT_MIMES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  'text/plain',
  'text/csv',
  'text/calendar',
  'application/rtf',
  'application/zip',
  'application/x-zip-compressed',
  'application/gzip',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
  'message/rfc822',
])

const EXTENSION_MIME = {
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  ics: 'text/calendar',
  rtf: 'application/rtf',
  zip: 'application/zip',
  gz: 'application/gzip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/x-rar-compressed',
  eml: 'message/rfc822',
}

function extensionMime(filename) {
  const parts = String(filename || '').toLowerCase().split('.')
  if (parts.length < 2) return null
  return EXTENSION_MIME[parts.pop() ?? ''] ?? null
}

export function resolveAllowedAttachmentMime(declared, sniffed, allowed) {
  const normalized = String(declared || '').toLowerCase().split(';')[0].trim()
  if (!sniffed || !allowed.has(sniffed)) return null

  if (!normalized || GENERIC_ATTACHMENT_MIMES.has(normalized)) return sniffed

  const accepted = MIME_EQUIVALENTS[normalized] ?? [normalized]
  if (!allowed.has(normalized) || !accepted.includes(sniffed)) return null
  return sniffed
}

/**
 * Resolve the stored MIME for a regular (non-inline) inbound email attachment.
 * Images and PDFs are content-verified via magic bytes; other common document
 * types are accepted by their declared MIME or filename extension. Returns null
 * for unsupported/unsafe types.
 */
export function resolveEmailAttachmentMime(declared, filename, sniffed, imageAndPdfAllowed) {
  const verified = resolveAllowedAttachmentMime(declared, sniffed, imageAndPdfAllowed)
  if (verified) return verified

  const normalized = String(declared || '').toLowerCase().split(';')[0].trim()
  if (DOCUMENT_ATTACHMENT_MIMES.has(normalized)) return normalized

  const byExt = extensionMime(filename)
  if (byExt && DOCUMENT_ATTACHMENT_MIMES.has(byExt)) return byExt
  return null
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
