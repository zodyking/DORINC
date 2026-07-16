import type { Db } from '../db/client'
import type { EmailBrandContext } from '../services/email-branding.service'
import { EMAIL_INLINE_LOGO_CID, loadInlineLogoAttachment } from './inline-logo'
import { sendMail } from './mailer'

export interface BrandedMailMessage {
  to: string
  subject: string
  text: string
  html: string
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
  const attachment = await loadInlineLogoAttachment(db, brand)
  if (!attachment) {
    return sendMail(message)
  }

  return sendMail({
    ...message,
    html: patchHtmlLogoToCid(message.html, brand.logoUrl, EMAIL_INLINE_LOGO_CID),
    attachments: [attachment],
  })
}
