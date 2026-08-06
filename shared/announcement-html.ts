import { sanitizeEmailHtml } from './email-display'

/** Sanitize admin-authored announcement HTML for safe display. */
export function sanitizeAnnouncementHtml(html: string): string {
  return sanitizeEmailHtml(html ?? '')
}

/** Allow only in-app paths or https URLs for CTA buttons. */
export function normalizeAnnouncementHref(href: string): string | null {
  const raw = String(href ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    if (raw.includes('://') || raw.toLowerCase().includes('javascript:')) return null
    return raw.slice(0, 500)
  }
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.toString().slice(0, 500)
  }
  catch {
    return null
  }
}
