import type { Db } from '../db/client'
import type { EmailBrandContext } from '../services/email-branding.service'
import { EMAIL_INLINE_LOGO_CID } from './inline-logo'
import { sendMail, sendNotificationMail } from './mailer'

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

function patchHtmlLogoToCid(html: string, logoUrl: string | null | undefined, cid: string): string {
  if (!logoUrl) return html
  const escaped = logoUrl
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  if (!html.includes(escaped) && !html.includes(logoUrl)) return html
  return html.split(escaped).join(`cid:${cid}`).split(logoUrl).join(`cid:${cid}`)
}

/** Send a branded HTML email with the logo embedded inline (no remote image fetch). */
export async function sendBrandedMail(
  db: Db,
  message: BrandedMailMessage,
  brand: EmailBrandContext,
) {
  const isThreadedReply = Boolean(message.inReplyTo?.trim() || message.references?.trim())
  if (isThreadedReply) {
    const { loadInlineLogoAttachment } = await import('./inline-logo')
    const userAttachments = message.attachments ?? []
    const logo = await loadInlineLogoAttachment(db, brand)
    if (!logo) {
      return sendMail(message)
    }

    return sendMail({
      ...message,
      html: patchHtmlLogoToCid(message.html, brand.logoUrl, EMAIL_INLINE_LOGO_CID),
      attachments: [{ ...logo, contentDisposition: 'inline' }, ...userAttachments],
    })
  }

  return sendNotificationMail(db, message)
}
