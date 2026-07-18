import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import type { Db } from '../db/client'
import { getSmtpConfig, type SmtpConfig } from '../services/app-config.service'
import {
  buildNotificationSendMailOptions,
  generateNotificationMessageId,
  logNotificationMimeDebug,
  prepareNotificationPlainText,
  sanitizeNotificationHtml,
} from './outbound-notification-mail.mjs'

let _transport: Transporter | undefined
let _transportKey: string | undefined

function transportKey(config: SmtpConfig): string {
  return `${config.host}:${config.port}:${config.user}:${config.from}`
}

function getTransport(): Transporter {
  const config = getSmtpConfig()
  if (!config?.host) {
    throw new Error('SMTP is not configured — complete setup or set SMTP_* environment variables')
  }

  const key = transportKey(config)
  if (!_transport || _transportKey !== key) {
    _transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    })
    _transportKey = key
  }
  return _transport
}

/** Bust cached transporter after SMTP settings change. */
export function resetMailTransport(): void {
  _transport = undefined
  _transportKey = undefined
}

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
  messageId?: string
  inReplyTo?: string
  references?: string
  debugLabel?: string
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType?: string
    cid?: string
    contentDisposition?: 'inline' | 'attachment'
  }>
}

export type NotificationMailMessage = Omit<MailMessage, 'inReplyTo' | 'references'>

/**
 * Send a standalone notification email (no reply threading headers).
 * Generates a unique Message-ID and embeds logos inline when possible.
 */
export async function sendNotificationMail(
  db: Db | undefined,
  message: NotificationMailMessage,
): Promise<{ delivered: boolean, messageId: string }> {
  const config = getSmtpConfig()
  if (!config?.from) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured')
    }
    console.warn('[mail] SMTP not configured (dev, ignored)')
    console.info(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`)
    return { delivered: false, messageId: message.messageId ?? generateNotificationMessageId('dev@local') }
  }

  const messageId = message.messageId ?? generateNotificationMessageId(config.from)

  try {
    const sanitizedHtml = sanitizeNotificationHtml(message.html)
    let html = sanitizedHtml
    let inlineAttachments: NotificationMailMessage['attachments'] = []

    if (db) {
      const { embedInlineLogoForBrand } = await import('./inline-logo')
      const { resolveEmailBrand } = await import('../services/email-branding.service')
      const brand = await resolveEmailBrand(db)
      const branded = await embedInlineLogoForBrand(db, sanitizedHtml, brand)
      html = branded.html
      inlineAttachments = branded.attachments
    }
    else {
      const { embedInlineLogoInHtml } = await import('./inline-logo.mjs')
      const branded = await embedInlineLogoInHtml(sanitizedHtml, {})
      html = branded.html
      inlineAttachments = branded.attachments
    }

    const mailOptions = buildNotificationSendMailOptions({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: prepareNotificationPlainText(message.text),
      html,
      messageId,
      attachments: [
        ...(inlineAttachments ?? []),
        ...(message.attachments ?? []),
      ],
    })

    await logNotificationMimeDebug(mailOptions, message.debugLabel ?? 'notification')
    await getTransport().sendMail(mailOptions)
    return { delivered: true, messageId }
  }
  catch (err) {
    if (process.env.NODE_ENV === 'production') throw err
    console.warn(`[mail] notification delivery failed (dev, ignored): ${(err as Error).message}`)
    console.info(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`)
    return { delivered: false, messageId }
  }
}

/**
 * Send a mail via SMTP. In development a delivery failure is logged and
 * swallowed so flows (signup, credential send) stay testable without a
 * real SMTP server; production failures propagate to the caller/queue.
 */
export async function sendMail(message: MailMessage): Promise<{ delivered: boolean }> {
  const config = getSmtpConfig()
  if (!config?.from) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured')
    }
    console.warn('[mail] SMTP not configured (dev, ignored)')
    console.info(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`)
    return { delivered: false }
  }

  try {
    await getTransport().sendMail({
      from: config.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
      attachments: message.attachments?.map(att => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        cid: att.cid,
        contentDisposition: att.contentDisposition ?? (att.cid ? 'inline' : 'attachment'),
      })),
    })
    return { delivered: true }
  }
  catch (err) {
    if (process.env.NODE_ENV === 'production') throw err
    console.warn(`[mail] delivery failed (dev, ignored): ${(err as Error).message}`)
    console.info(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`)
    return { delivered: false }
  }
}
