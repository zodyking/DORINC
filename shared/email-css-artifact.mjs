/** Detect plain-text bodies that are really leaked <style> CSS from HTML emails. */

const EMAIL_TEMPLATE_CLASS_RE = /\.email-(?:container|shell|outer)|\.mobile-padding|\.secondary-link|\.data-label/i

function countCssProperties(text) {
  return (text.match(/[a-z-]+\s*:\s*[^;}\n]+;/gi) ?? []).length
}

export function looksLikeEmailCssArtifact(text) {
  const plain = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!plain || plain.length < 40) return false

  const cssPropertyCount = countCssProperties(plain)
  const cssRuleMatches = plain.match(/[{][^}]{10,}[}]/g) ?? []

  if (EMAIL_TEMPLATE_CLASS_RE.test(plain) && cssPropertyCount >= 3) return true

  const words = plain.split(/\s+/).filter(word => word.length > 1)
  if (cssPropertyCount >= 5 && cssPropertyCount / Math.max(words.length, 1) > 0.25) return true

  const trimmed = plain.trim()
  if (/^(?:body|html|\*|table|img|a)\s*\{/.test(trimmed)) return true
  if (/^\.\w[\w-]*\s*\{/.test(trimmed) && cssPropertyCount >= 2) return true

  if (cssRuleMatches.length >= 2 && cssPropertyCount >= 4) {
    const proseWords = plain
      .replace(/[{][^}]*[}]/g, ' ')
      .replace(/[.#]?[\w-]+\s*\{/g, ' ')
      .split(/\s+/)
      .filter(word => /^[a-zA-Z]{3,}$/.test(word)
        && !/^(margin|padding|border|width|height|font|color|background|display)$/i.test(word))
    if (proseWords.length < 5) return true
  }

  return false
}

export function stripHtmlToPlainText(html) {
  return String(html ?? '')
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

export function normalizeInboundBody(text, html) {
  let plain = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (plain && looksLikeEmailCssArtifact(plain)) plain = ''
  if (plain) return plain
  if (html) return stripHtmlToPlainText(html) || '(empty message)'
  return '(empty message)'
}
