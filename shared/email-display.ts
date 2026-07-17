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

function stripLayoutConstraintsFromStyle(style: string): string {
  return style
    .replace(/(?:^|;)\s*(?:height|min-height|max-height|overflow(?:-[xy])?)\s*:[^;]*/gi, '')
    .replace(/;\s*;/g, ';')
    .replace(/^\s*;+|\s*;+$/g, '')
    .trim()
}

const INLINE_STYLE_ATTR_RE = /\sstyle\s*=\s*("([^"]*)"|'([^']*)')/gi

function sanitizeTagAttributes(tag: string): string {
  let safe = tag.replace(JAVASCRIPT_URL_RE, '')
  safe = safe.replace(GLOBAL_FORBIDDEN_ATTR_RE, '')
  safe = safe.replace(INLINE_STYLE_ATTR_RE, (_match, _quote, doubleQuoted, singleQuoted) => {
    const raw = doubleQuoted ?? singleQuoted ?? ''
    const cleaned = stripLayoutConstraintsFromStyle(raw)
    if (!cleaned) return ''
    const quote = doubleQuoted !== undefined ? '"' : '\''
    return ` style=${quote}${cleaned}${quote}`
  })
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
    .replace(/\b(?:height|min-height|max-height|overflow(?:-[xy])?)\s*:\s*[^;{}]+;?/gi, '')
    .replace(/\bdisplay\s*:\s*none\s*;?/gi, '')
}

function htmlTextLength(html: string): number {
  return cleanPlainEmailText(stripHtmlToText(html)).length
}

function plainSubstanceMissingFromHtml(plain: string, html: string): boolean {
  const htmlAsText = cleanPlainEmailText(stripHtmlToText(html)).toLowerCase()
  const words = cleanPlainEmailText(plain).toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (!words.length) return false
  const missing = words.filter(word => !htmlAsText.includes(word))
  return missing.length >= Math.max(1, Math.ceil(words.length * 0.5))
}

/**
 * Prefer plain text when HTML is mostly signature/boilerplate but the stored
 * plain body still has the actual customer message (common with Gmail mobile).
 */
export function shouldRenderEmailAsHtml(
  html: string | null | undefined,
  body?: string | null,
  _direction?: 'inbound' | 'outbound',
): boolean {
  if (!html?.trim() || !prepareEmailHtmlIframeDocument(html)) return false

  if (/<img\b/i.test(html) || /\bcid:/i.test(html) || /\/attachments\/[^"'\s]+\/preview/i.test(html)) {
    return true
  }

  const plain = cleanPlainEmailText(body ?? '')
  if (!plain) return true

  const htmlAsText = htmlTextLength(html)
  if (!htmlAsText) return false

  if (plain.length >= 8 && htmlAsText >= 24 && plainSubstanceMissingFromHtml(plain, html)) {
    return false
  }

  return true
}

export function emailBodyForDisplay(body: string, html?: string | null): { mode: 'html' | 'text', content: string } {
  const plain = cleanPlainEmailText(body)
  if (html?.trim() && shouldRenderEmailAsHtml(html, body)) {
    return { mode: 'html', content: html }
  }
  if (plain) return { mode: 'text', content: linkifyPlainEmailText(plain) }
  if (html?.trim()) {
    const fallback = cleanPlainEmailText(stripHtmlToText(html))
    if (fallback) return { mode: 'text', content: linkifyPlainEmailText(fallback) }
  }
  return { mode: 'text', content: '<span class="dm-email-empty">(empty message)</span>' }
}

const EMAIL_IFRAME_BASE_STYLES = `
  html, body { margin: 0; padding: 0; background: #fff; width: 100%; height: auto; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    color: #202124;
    word-wrap: break-word;
    overflow-wrap: anywhere;
    overflow: visible;
  }
  img { max-width: 100% !important; height: auto !important; }
  table { max-width: 100% !important; width: 100% !important; }
  td, th { word-break: break-word; }
  pre { white-space: pre-wrap; overflow-x: auto; overflow-y: visible; }
  a { color: #1a73e8; }
  blockquote {
    margin: 0 0 1em;
    padding-left: 12px;
    border-left: 3px solid #dadce0;
    color: #5f6368;
  }
`

/** Applied last so inbound email CSS cannot crunch the iframe viewport. */
const EMAIL_IFRAME_LAYOUT_GUARDS = `
  html, body {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }
  body, body * {
    max-height: none !important;
    position: static !important;
    float: none !important;
    transform: none !important;
    clip: auto !important;
    clip-path: none !important;
    visibility: visible !important;
  }
  body div, body p, body pre, body blockquote, body table, body td, body th, body span {
    overflow: visible !important;
    height: auto !important;
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

  const styles = [...styleBlocks, EMAIL_IFRAME_BASE_STYLES, EMAIL_IFRAME_LAYOUT_GUARDS].join('\n')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base target="_blank"><style>${styles}</style></head><body>${sanitizedBody}</body></html>`
}

/** Render thread messages with sanitized HTML templates when available. */
export function emailBodyForThreadDisplay(
  body: string,
  html: string | null | undefined,
  _direction?: 'inbound' | 'outbound',
): { mode: 'html' | 'text', content: string } {
  return emailBodyForDisplay(body, html)
}
