/** Staples / EFI PrintMe email-to-print helpers (shared by API + IMAP worker). */

export const STAPLES_PRINTME_TO = 'print@printme.com'
export const STAPLES_PRINTME_SUBJECT_PREFIX = 'DORINC Service Log Sheet'
export const STAPLES_PRINTME_TOKEN_RE = /\[DORINC-PRINT-([A-Z0-9]{8,20})\]/i
export const STAPLES_PRINTME_CODE_TTL_MS = 24 * 60 * 60 * 1000
export const STAPLES_PRINTME_LOCATOR_URL = 'https://www.printme.com'

export const STAPLES_PRINT_JOB_STATUSES = [
  'queued',
  'emailed',
  'awaiting_reply',
  'ready',
  'failed',
  'expired',
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

/**
 * Extract a PrintMe release / document ID from confirmation email text.
 * Codes are typically 6–8 alphanumeric characters.
 * @param {string | null | undefined} text
 * @param {string | null | undefined} html
 */
export function extractPrintMeReleaseCode(text, html = null) {
  const plain = [
    String(text || ''),
    String(html || '').replace(/<[^>]+>/g, ' '),
  ].join('\n').replace(/&nbsp;/gi, ' ')

  const labeled = plain.match(
    /(?:release\s*code|document\s*id|doc(?:ument)?\s*id|printme\s*(?:code|id)|your\s*code)\s*(?:is\s*)?[:#-]?\s*([A-Z0-9]{6,8})\b/i,
  )
  if (labeled?.[1]) return labeled[1].toUpperCase()

  // Short confirmation bodies often put the code on its own line.
  const lines = plain.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (/^[A-Z0-9]{6,8}$/i.test(line) && !/THANKS|PRINTME|STAPLES|SERVICE|DOCUMENT|RELEASE/i.test(line)) {
      return line.toUpperCase()
    }
  }

  // Prefer mixed alphanumeric codes over common English words.
  const candidates = [...plain.matchAll(/\b(?=[A-Z0-9]*\d)([A-Z0-9]{6,8})\b/gi)]
    .map(m => String(m[1] || '').toUpperCase())
    .filter(Boolean)
    .filter(code => !/DORINC|PRINTME|STAPLES|SERVICE|DOCUMENT|RELEASE/i.test(code))
  if (candidates[0]) return candidates[0]

  return null
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
  // Some MTAs strip angle brackets inconsistently.
  const bare = outbound.replace(/^<|>$/g, '')
  if (bare && haystack.includes(bare)) return true
  return Boolean(extractPrintMeSubjectToken(reply.subject))
}
