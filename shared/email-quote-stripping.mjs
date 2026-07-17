/** Strip quoted reply history from plain-text and HTML email bodies. */

const PLAIN_REPLY_SPLIT_PATTERNS = [
  /\nOn .{0,280}\bwrote:\s*\n/i,
  /\n-{2,}\s*Original Message\s*-{2,}/i,
  /\n-{5,}\s*Forwarded message\s*-{5,}/i,
  /\nFrom:\s.+\n(?:Sent|Date):\s.+\nTo:\s.+\nSubject:/i,
  /\n_{5,}\n/,
]

export function stripQuotedPlainEmailText(text) {
  let plain = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!plain) return plain

  let cutAt = plain.length
  for (const pattern of PLAIN_REPLY_SPLIT_PATTERNS) {
    const match = pattern.exec(plain)
    if (match && match.index > 0 && match.index < cutAt) cutAt = match.index
  }
  if (cutAt < plain.length) plain = plain.slice(0, cutAt).trim()

  return plain.replace(/\n(?:>[^\n]*\n?)+$/g, '').trim() || String(text ?? '').trim()
}

export function stripQuotedEmailHtml(html) {
  const raw = String(html ?? '').trim()
  if (!raw) return raw

  let out = raw
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*gmail_extra[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*id="[^"]*divRplyFwdMsg[^"]*"[^>]*>[\s\S]*/gi, '')

  const onWrote = out.match(/On .{10,320} wrote:/i)
  if (onWrote?.index && onWrote.index > 24) {
    out = out.slice(0, onWrote.index).replace(/<[^>]*$/g, '').trim()
  }

  return out.trim() || raw
}
