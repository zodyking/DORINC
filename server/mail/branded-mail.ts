import type { Db } from '../db/client'
import type { EmailBrandContext } from '../services/email-branding.service'
import { sendMail } from './mailer'

export interface BrandedMailMessage {
  to: string
  subject: string
  text: string
  html: string
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

/** Send a branded HTML email (text header layout — no inline logo images). */
export async function sendBrandedMail(
  _db: Db,
  message: BrandedMailMessage,
  _brand: EmailBrandContext,
) {
  return sendMail(message)
}
