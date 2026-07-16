/** Helpers for inline email images referenced by Content-ID (cid: URLs). */

const CID_ATTR_RE = /\b(src|href)\s*=\s*(["'])\s*cid:([^"']+)\2/gi
const CID_STYLE_RE = /url\(\s*["']?cid:([^"')]+)["']?\s*\)/gi

export function normalizeContentId(raw: string): string {
  return raw
    .replace(/^cid:/i, '')
    .replace(/^<|>$/g, '')
    .trim()
    .toLowerCase()
}

/** Replace cid: references with authenticated preview URLs when inline files exist. */
export function rewriteEmailHtmlCidSources(
  html: string,
  resolveUrl: (contentId: string) => string | null,
): string {
  if (!html || !/\bcid:/i.test(html)) return html

  let out = html.replace(CID_ATTR_RE, (match, attr, quote, cid) => {
    const url = resolveUrl(normalizeContentId(cid))
    return url ? `${attr}=${quote}${url}${quote}` : match
  })

  out = out.replace(CID_STYLE_RE, (match, cid) => {
    const url = resolveUrl(normalizeContentId(cid))
    return url ? `url("${url}")` : match
  })

  return out
}
