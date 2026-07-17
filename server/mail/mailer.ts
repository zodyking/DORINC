import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { getSmtpConfig, type SmtpConfig } from '../services/app-config.service'

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
  attachments?: Array<{
    filename: string
    content: Buffer
    contentType?: string
    cid?: string
  }>
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
