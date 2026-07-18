/**
 * Outbound transactional notification mail — standalone messages for Gmail.
 * Never sets In-Reply-To, References, or reply threading metadata.
 */
import { randomUUID } from 'node:crypto'
import MailComposer from 'nodemailer/lib/mail-composer/index.js'
import { embedInlineLogoInHtml } from './inline-logo.mjs'

/**
 * @param {string} fromAddress
 */
export function extractSmtpDomain(fromAddress) {
  const match = String(fromAddress ?? '').match(/@([^>\s]+)/)
  return match?.[1]?.toLowerCase() || 'dorinc.local'
}

/**
 * @param {string} fromAddress
 */
export function generateNotificationMessageId(fromAddress) {
  return `<notification.${randomUUID()}@${extractSmtpDomain(fromAddress)}>`
}

/**
 * @param {string | undefined} text
 */
export function prepareNotificationPlainText(text) {
  return String(text ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/^>\s?/, ''))
    .join('\n')
    .trim()
}

const QUOTE_CONTAINER_RE = /<blockquote[\s\S]*?<\/blockquote>/gi
const GMAIL_QUOTE_RE = /<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*?<\/div>/gi
const GMAIL_EXTRA_RE = /<div[^>]*class="[^"]*gmail_extra[^"]*"[^>]*>[\s\S]*?<\/div>/gi

/**
 * Strip quoted-reply containers and add a per-message uniqueness marker so Gmail
 * does not collapse repeated notification boilerplate in a conversation thread.
 *
 * @param {string | undefined} html
 */
export function sanitizeNotificationHtml(html) {
  if (!html) return html
  let out = String(html)
    .replace(QUOTE_CONTAINER_RE, '')
    .replace(GMAIL_QUOTE_RE, '')
    .replace(GMAIL_EXTRA_RE, '')

  if (!out.includes('<!-- dorinc-notification:')) {
    const marker = `<!-- dorinc-notification:${randomUUID()} -->`
    out = out.replace(/<body([^>]*)>/i, `<body$1>\n  ${marker}`)
  }
  return out
}

/**
 * @param {{ html?: string, text?: string, pool?: import('pg').Pool }} input
 */
export async function prepareNotificationMailContent(input) {
  const sanitizedHtml = sanitizeNotificationHtml(input.html)
  const prepared = await embedInlineLogoInHtml(sanitizedHtml, { pool: input.pool })
  return {
    text: prepareNotificationPlainText(input.text),
    html: prepared.html,
    inlineAttachments: prepared.attachments.map(att => ({
      filename: att.filename,
      content: att.content,
      contentType: att.contentType,
      cid: att.cid,
      contentDisposition: 'inline',
    })),
  }
}

/**
 * @param {{
 *   from: string,
 *   to: string,
 *   subject: string,
 *   text: string,
 *   html?: string,
 *   messageId: string,
 *   attachments?: Array<Record<string, unknown>>,
 * }} input
 */
export function buildNotificationSendMailOptions(input) {
  const attachments = (input.attachments ?? []).map(att => ({
    filename: att.filename,
    content: att.content,
    contentType: att.contentType ?? 'application/octet-stream',
    contentDisposition: att.cid ? 'inline' : 'attachment',
    cid: att.cid,
  }))

  return {
    from: input.from,
    to: input.to,
    subject: String(input.subject ?? '').trim(),
    text: input.text,
    html: input.html,
    messageId: input.messageId,
    headers: {
      'X-DORINC-Notification': 'transactional',
      'X-Entity-Ref-ID': randomUUID(),
    },
    attachments: attachments.length ? attachments : undefined,
  }
}

/**
 * @param {Record<string, unknown>} mailOptions
 */
export async function composeRawMimeMessage(mailOptions) {
  const composer = new MailComposer(mailOptions)
  return new Promise((resolve, reject) => {
    composer.compile().build((err, message) => {
      if (err) reject(err)
      else resolve(message)
    })
  })
}

/**
 * @param {Record<string, unknown>} mailOptions
 * @param {string} [label]
 */
export async function logNotificationMimeDebug(mailOptions, label = 'notification') {
  if (process.env.DEBUG_EMAIL_MIME !== '1' && process.env.NODE_ENV === 'production') return

  try {
    const raw = await composeRawMimeMessage(mailOptions)
    const mime = raw.toString('utf8')
    const hasReplyHeaders = /^(In-Reply-To|References):/mi.test(mime)
    const hasBlockquote = /<blockquote/i.test(mime)
    const imgSrcs = [...mime.matchAll(/src="([^"]+)"/gi)].map(m => m[1])
    console.info(`[mail-debug:${label}] Message-ID: ${mailOptions.messageId}`)
    console.info(`[mail-debug:${label}] Reply headers present: ${hasReplyHeaders}`)
    console.info(`[mail-debug:${label}] Blockquote in MIME: ${hasBlockquote}`)
    console.info(`[mail-debug:${label}] Image sources: ${imgSrcs.join(', ') || '(none)'}`)
    if (process.env.DEBUG_EMAIL_MIME === 'full') {
      console.info(`[mail-debug:${label}] Raw MIME:\n${mime}`)
    }
  }
  catch (err) {
    console.warn(`[mail-debug:${label}] compose failed:`, err instanceof Error ? err.message : err)
  }
}

/**
 * Deliver a standalone notification email (invoice, estimate, portal status, etc.).
 *
 * @param {import('nodemailer').Transporter} transport
 * @param {import('pg').Pool | undefined} pool
 * @param {{
 *   from: string,
 *   to: string,
 *   subject: string,
 *   text: string,
 *   html?: string,
 *   messageId?: string,
 *   attachments?: Array<Record<string, unknown>>,
 *   debugLabel?: string,
 * }} input
 */
export async function sendNotificationMail(transport, pool, input) {
  const messageId = input.messageId ?? generateNotificationMessageId(input.from)
  const content = await prepareNotificationMailContent({
    html: input.html,
    text: input.text,
    pool,
  })

  const mailOptions = buildNotificationSendMailOptions({
    from: input.from,
    to: input.to,
    subject: input.subject,
    text: content.text,
    html: content.html,
    messageId,
    attachments: [...content.inlineAttachments, ...(input.attachments ?? [])],
  })

  await logNotificationMimeDebug(mailOptions, input.debugLabel ?? 'notification')
  await transport.sendMail(mailOptions)
  return { messageId }
}
