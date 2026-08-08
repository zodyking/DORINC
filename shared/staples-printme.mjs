/** Staples PrintMe email-to-print helpers (shared by API + IMAP worker). */

/** Staples branded PrintMe inbox (not the generic print@printme.com address). */
export const STAPLES_PRINTME_TO = 'staples@printme.com'
export const STAPLES_PRINTME_SUBJECT_PREFIX = 'DORINC Service Log Sheet'
export const STAPLES_PRINTME_TOKEN_RE = /\[DORINC-PRINT-([A-Z0-9]{8,20})\]/i
export const STAPLES_PRINTME_CODE_TTL_MS = 24 * 60 * 60 * 1000
export const STAPLES_PRINTME_LOCATOR_URL = 'https://www.printme.com'
/** Near-real-time IMAP nudge while a PrintMe reply is outstanding. */
export const STAPLES_PRINTME_IMAP_POLL_MS = 5_000

export const STAPLES_PRINT_JOB_STATUSES = [
  'queued',
  'emailed',
  'awaiting_reply',
  'ready',
  'failed',
  'expired',
  'dismissed',
]

/**
 * @param {string | null | undefined} raw
 */
export function normalizePrintMeAddress(raw) {
  if (!raw) return ''
  const match = String(raw).match(/<([^>]+)>/)
  return (match?.[1] ?? String(raw)).trim().toLowerCase()
}

/**
 * @param {string | null | undefined} from
 */
export function isPrintMeSender(from) {
  const addr = normalizePrintMeAddress(from)
  if (!addr) return false
  return addr.endsWith('@printme.com')
    || addr.endsWith('@staples.com')
    || addr.includes('printme')
}

/**
 * @param {string} token
 */
export function buildPrintMeSubject(token) {
  return `${STAPLES_PRINTME_SUBJECT_PREFIX} [DORINC-PRINT-${token}]`
}

/**
 * Plain-text-only PrintMe upload body.
 * Avoid HTML bodies — PrintMe treats HTML as a printable document type.
 * @param {string} token
 */
export function buildPrintMeTextBody(token) {
  return [
    'Service log sheet PDF attached for Staples PrintMe cloud printing.',
    '',
    `Correlation: DORINC-PRINT-${token}`,
  ].join('\n')
}

/**
 * @param {Buffer | Uint8Array | null | undefined} pdf
 */
export function assertPrintMePdfAttachment(pdf) {
  if (!pdf || !pdf.length) {
    return { ok: false, reason: 'PDF is empty' }
  }
  if (pdf.length < 100) {
    return { ok: false, reason: 'PDF is too small to be valid' }
  }
  const head = Buffer.from(pdf.subarray(0, 5)).toString('utf8')
  if (head !== '%PDF-') {
    return { ok: false, reason: 'Rendered file is not a PDF' }
  }
  if (pdf.length > 25 * 1024 * 1024) {
    return { ok: false, reason: 'PDF exceeds PrintMe 25 MB limit' }
  }
  return { ok: true, reason: null, bytes: pdf.length }
}

/**
 * Build the outbound PrintMe mail payload (to/subject/text/attachment).
 * @param {{ token: string, pdf: Buffer | Uint8Array }} input
 */
export function buildPrintMeMailPayload(input) {
  const check = assertPrintMePdfAttachment(input.pdf)
  if (!check.ok) {
    return { ok: false, reason: check.reason, mail: null }
  }

  const content = Buffer.isBuffer(input.pdf) ? input.pdf : Buffer.from(input.pdf)
  return {
    ok: true,
    reason: null,
    mail: {
      to: STAPLES_PRINTME_TO,
      subject: buildPrintMeSubject(input.token),
      text: buildPrintMeTextBody(input.token),
      // Intentionally no HTML — PrintMe can treat HTML as a document.
      attachments: [{
        filename: 'service-log-sheet.pdf',
        content,
        contentType: 'application/pdf',
        contentDisposition: 'attachment',
      }],
    },
  }
}

/**
 * @param {string | null | undefined} subject
 */
export function extractPrintMeSubjectToken(subject) {
  const match = String(subject || '').match(STAPLES_PRINTME_TOKEN_RE)
  return match?.[1]?.toUpperCase() ?? null
}

const RELEASE_CODE_LABEL_RE = /(?:retrieval\s*code|release\s*code|document\s*id|doc(?:ument)?\s*id|printme\s*(?:code|id)|your\s*code|barcode)\s*(?:is\s*)?[:#-]?\s*/i
const NOISE_CODE_RE = /DORINC|PRINTME|STAPLES|SERVICE|DOCUMENT|RELEASE|RETRIEVAL|BARCODE|THANK/i

/**
 * Extract Staples PrintMe release code from confirmation email text.
 * Real Staples replies use an 8-character alphanumeric code (e.g. BE9C8635),
 * often labeled "Release code:" — not digits-only and not a QR code.
 * @param {string | null | undefined} text
 * @param {string | null | undefined} html
 */
export function extractPrintMeReleaseCode(text, html = null) {
  const plain = [
    String(text || ''),
    String(html || '').replace(/<[^>]+>/g, ' '),
  ].join('\n').replace(/&nbsp;/gi, ' ')

  // Prefer labeled 8-char alphanumeric codes (PrintMe / Staples confirmation).
  const labeledEightAlpha = plain.match(
    new RegExp(`${RELEASE_CODE_LABEL_RE.source}([A-Z0-9]{8})\\b`, 'i'),
  )
  if (labeledEightAlpha?.[1]) return labeledEightAlpha[1].toUpperCase()

  // Labeled 8-digit fallback (older docs).
  const labeledEightDigit = plain.match(
    new RegExp(`${RELEASE_CODE_LABEL_RE.source}(\\d{8})\\b`, 'i'),
  )
  if (labeledEightDigit?.[1]) return labeledEightDigit[1]

  // Labeled 6–8 alphanumeric (generic PrintMe).
  const labeledAlpha = plain.match(
    new RegExp(`${RELEASE_CODE_LABEL_RE.source}([A-Z0-9]{6,8})\\b`, 'i'),
  )
  if (labeledAlpha?.[1]) return labeledAlpha[1].toUpperCase()

  const lines = plain.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (/^[A-Z0-9]{8}$/i.test(line) && !NOISE_CODE_RE.test(line)) {
      return line.toUpperCase()
    }
  }

  for (const line of lines) {
    if (/^\d{8}$/.test(line)) return line
  }

  const eightAlpha = [...plain.matchAll(/\b(?=[A-Z0-9]*\d)([A-Z0-9]{8})\b/gi)]
    .map(m => String(m[1] || '').toUpperCase())
    .filter(code => code && !NOISE_CODE_RE.test(code))
  if (eightAlpha[0]) return eightAlpha[0]

  const eightDigit = plain.match(/\b(\d{8})\b/)
  if (eightDigit?.[1]) return eightDigit[1]

  for (const line of lines) {
    if (/^[A-Z0-9]{6,8}$/i.test(line) && !NOISE_CODE_RE.test(line)) {
      return line.toUpperCase()
    }
  }

  const candidates = [...plain.matchAll(/\b(?=[A-Z0-9]*\d)([A-Z0-9]{6,8})\b/gi)]
    .map(m => String(m[1] || '').toUpperCase())
    .filter(Boolean)
    .filter(code => !NOISE_CODE_RE.test(code))
  if (candidates[0]) return candidates[0]

  return null
}

/**
 * Pick the barcode image from a PrintMe confirmation email's MIME parts.
 * @param {Array<{
 *   filename?: string | null,
 *   contentType?: string | null,
 *   content?: Buffer | Uint8Array | null,
 *   contentDisposition?: string | null,
 *   cid?: string | null,
 * }> | null | undefined} attachments
 * @returns {{ content: Buffer, contentType: string, filename: string } | null}
 */
export function pickPrintMeBarcodeAttachment(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return null

  const images = attachments
    .map((att, index) => {
      const contentType = String(att?.contentType || '').toLowerCase().split(';')[0].trim()
      if (!contentType.startsWith('image/')) return null
      if (!att?.content || !att.content.length) return null
      const content = Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content)
      if (content.length < 40 || content.length > 2 * 1024 * 1024) return null
      const filename = String(att.filename || att.cid || `barcode-${index}.png`)
      const name = filename.toLowerCase()
      const score = (
        ( /barcode|release|code|printme/i.test(name) ? 40 : 0)
        + (att.contentDisposition === 'inline' || att.cid ? 20 : 0)
        + (contentType === 'image/png' ? 10 : 0)
        + Math.min(content.length / 1024, 30)
      )
      return { content, contentType, filename, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)

  const best = images[0]
  if (!best) return null
  return {
    content: best.content,
    contentType: best.contentType,
    filename: best.filename,
  }
}

/**
 * Minimal Code 128-B SVG for Staples self-serve scanners when the reply image is missing.
 * @param {string} value
 */
export function buildCode128Svg(value) {
  const text = String(value || '').trim().toUpperCase()
  if (!text || text.length > 20) {
    throw new Error('Invalid release code for barcode')
  }

  // Code 128 patterns indexed 0–106 (stop = 106). Values are bar/space widths.
  const PATTERNS = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
  ]

  const START_B = 104
  const STOP = 106
  const codes = [START_B]
  let checksum = START_B

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32
    if (code < 0 || code > 95) {
      throw new Error('Release code contains unsupported barcode characters')
    }
    codes.push(code)
    checksum += code * (i + 1)
  }
  codes.push(checksum % 103)
  codes.push(STOP)

  const moduleWidth = 2
  const height = 72
  const quiet = 10 * moduleWidth
  let x = quiet
  const rects = []

  for (const code of codes) {
    const pattern = PATTERNS[code]
    if (!pattern) throw new Error('Invalid Code 128 pattern')
    let bar = true
    for (const ch of pattern) {
      const w = Number(ch) * moduleWidth
      if (bar) {
        rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}" fill="#000"/>`)
      }
      x += w
      bar = !bar
    }
  }

  const width = x + quiet
  const labelY = height + 22
  const svgHeight = height + 36
  const escaped = text.replace(/[<>&'"]/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c] || c))

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${svgHeight}" viewBox="0 0 ${width} ${svgHeight}" role="img" aria-label="Release code ${escaped}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`,
    ...rects,
    `<text x="${width / 2}" y="${labelY}" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="18" font-weight="700" fill="#111">${escaped}</text>`,
    `</svg>`,
  ].join('')
}

/**
 * @param {string} outboundMessageId
 * @param {{ inReplyTo?: string | null, references?: string | null, subject?: string | null }} reply
 */
export function replyMatchesPrintMeJob(outboundMessageId, reply) {
  const outbound = String(outboundMessageId || '').trim()
  if (!outbound) return Boolean(extractPrintMeSubjectToken(reply.subject))

  const haystack = [
    reply.inReplyTo,
    reply.references,
  ].filter(Boolean).join(' ')

  if (haystack.includes(outbound)) return true
  const bare = outbound.replace(/^<|>$/g, '')
  if (bare && haystack.includes(bare)) return true
  return Boolean(extractPrintMeSubjectToken(reply.subject))
}
