import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

let _transport: Transporter | undefined

function getTransport(): Transporter {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  }
  return _transport
}

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

/**
 * Send a mail via SMTP. In development a delivery failure is logged and
 * swallowed so flows (signup, credential send) stay testable without a
 * real SMTP server; production failures propagate to the caller/queue.
 */
export async function sendMail(message: MailMessage): Promise<{ delivered: boolean }> {
  try {
    await getTransport().sendMail({ from: process.env.SMTP_FROM, ...message })
    return { delivered: true }
  }
  catch (err) {
    if (process.env.NODE_ENV === 'production') throw err
    console.warn(`[mail] delivery failed (dev, ignored): ${(err as Error).message}`) // eslint-disable-line no-console
    console.info(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`) // eslint-disable-line no-console
    return { delivered: false }
  }
}
