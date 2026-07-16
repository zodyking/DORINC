/** Shared helpers for displaying inbound/outbound email bodies in the UI. */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi
const IMAGE_PLACEHOLDER_RE = /\[image:\s*[^\]]+\]/gi
const TRACKING_PIXEL_RE = /<img[^>]+(?:width|height)\s*=\s*["']?1["']?[^>]*>/gi

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'address', 'article', 'b', 'blockquote', 'br', 'caption', 'center', 'code',
  'col', 'colgroup', 'dd', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'font', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'li', 'main', 'nav', 'ol',
  'p', 'pre', 'section', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
])

const GLOBAL_FORBIDDEN_ATTR_RE = /\s(on\w+|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi
const JAVASCRIPT_URL_RE = /\s(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function cleanPlainEmailText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(IMAGE_PLACEHOLDER_RE, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function normalizeInboundEmailText(text: string, html?: string | null): string {
  const plain = cleanPlainEmailText(text)
  if (plain) return plain
  if (html) return cleanPlainEmailText(stripHtmlToText(html))
  return '(empty message)'
}

export function shortenUrlForPreview(url: string, max = 48): string {
  try {
    const parsed = new URL(url)
    const compact = `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`
    if (compact.length <= max) return compact
    return `${compact.slice(0, max - 1)}…`
  }
  catch {
    if (url.length <= max) return url
    return `${url.slice(0, max - 1)}…`
  }
}

export function emailPreviewText(body: string, html?: string | null): string {
  const source = cleanPlainEmailText(body) || (html ? stripHtmlToText(html) : '')
  if (!source) return '(empty message)'
  const withoutUrls = source.replace(URL_RE, match => shortenUrlForPreview(match))
  return withoutUrls.replace(/\s+/g, ' ').trim().slice(0, 140)
}

export function linkifyPlainEmailText(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  return escaped.replace(URL_RE, (url) => {
    const safe = url.replace(/&amp;/g, '&')
    const label = shortenUrlForPreview(safe, 56)
    return `<a href="${safe.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${label}</a>`
  })
}

function sanitizeTagAttributes(tag: string): string {
  let safe = tag.replace(JAVASCRIPT_URL_RE, '')
  safe = safe.replace(GLOBAL_FORBIDDEN_ATTR_RE, '')
  return safe
}

/** Allowlist sanitizer for trusted-enough email HTML display in staff UI. */
export function sanitizeEmailHtml(html: string): string {
  if (!html.trim()) return ''

  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(TRACKING_PIXEL_RE, '')

  return withoutNoise.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tagName: string) => {
    const tag = tagName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''
    if (match.startsWith('</')) return `</${tag}>`
    return sanitizeTagAttributes(match)
  })
}

/** Strip dangerous CSS while keeping layout rules from marketing emails. */
export function sanitizeEmailStyleBlock(css: string): string {
  return css
    .replace(/@import\b[^;]+;/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/behavior\s*:/gi, '')
    .replace(/-moz-binding/gi, '')
    .replace(/binding\s*:/gi, '')
}

const EMAIL_IFRAME_BASE_STYLES = `
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #202124;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; }
  pre { white-space: pre-wrap; overflow-x: auto; }
  a { color: #1a73e8; }
  blockquote {
    margin: 0 0 1em;
    padding-left: 12px;
    border-left: 3px solid #dadce0;
    color: #5f6368;
  }
`

/** Gmail-style sandboxed document — preserves <style> blocks from the original email. */
export function prepareEmailHtmlIframeDocument(html: string): string {
  const raw = html.trim()
  if (!raw) return ''

  const styleBlocks: string[] = []
  let bodySource = raw.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
    const cleaned = sanitizeEmailStyleBlock(css)
    if (cleaned.trim()) styleBlocks.push(cleaned)
    return ''
  })

  const bodyMatch = bodySource.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    bodySource = bodyMatch[1]
  }
  else {
    bodySource = bodySource
      .replace(/<!doctype[^>]*>/gi, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
  }

  const sanitizedBody = sanitizeEmailHtml(bodySource)
  if (!sanitizedBody.trim()) return ''

  const styles = [EMAIL_IFRAME_BASE_STYLES, ...styleBlocks].join('\n')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>${styles}</style></head><body>${sanitizedBody}</body></html>`
}

export function shouldRenderEmailAsHtml(
  html: string | null | undefined,
  direction: 'inbound' | 'outbound' | undefined,
): boolean {
  return direction !== 'outbound' && !!html?.trim()
}

export function emailBodyForDisplay(body: string, html?: string | null): { mode: 'html' | 'text', content: string } {
  const plain = cleanPlainEmailText(body)
  if (html?.trim() && prepareEmailHtmlIframeDocument(html)) {
    return { mode: 'html', content: html }
  }
  if (plain) return { mode: 'text', content: linkifyPlainEmailText(plain) }
  return { mode: 'text', content: '<span class="dm-email-empty">(empty message)</span>' }
}

/** Prefer compose text for staff outbound; full HTML for inbound customer mail. */
export function emailBodyForThreadDisplay(
  body: string,
  html: string | null | undefined,
  direction: 'inbound' | 'outbound' | undefined,
): { mode: 'html' | 'text', content: string } {
  if (direction === 'outbound') {
    const plain = cleanPlainEmailText(body)
    if (plain) return { mode: 'text', content: linkifyPlainEmailText(plain) }
    return { mode: 'text', content: '<span class="dm-email-empty">(empty message)</span>' }
  }
  if (shouldRenderEmailAsHtml(html, direction)) {
    return { mode: 'html', content: html! }
  }
  return emailBodyForDisplay(body, html)
}
