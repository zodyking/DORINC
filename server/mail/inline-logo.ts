import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Db } from '../db/client'
import type { EmailBrandContext } from '../services/email-branding.service'
import { resolveImageDisplayPreview } from '../services/files.service'

export const EMAIL_INLINE_LOGO_CID = 'logo@dorinc'

export interface InlineLogoAttachment {
  filename: string
  content: Buffer
  contentType: string
  cid: string
  contentDisposition?: 'inline' | 'attachment'
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

const DEFAULT_LOGO_PATHS = [
  join(process.cwd(), 'public/images/dorinc-icon-trans.png'),
  join(process.cwd(), '.output/public/images/dorinc-icon-trans.png'),
]

async function readDefaultLogo(): Promise<InlineLogoAttachment> {
  for (const path of DEFAULT_LOGO_PATHS) {
    try {
      const content = await readFile(path)
      return {
        filename: 'logo.png',
        content,
        contentType: 'image/png',
        cid: EMAIL_INLINE_LOGO_CID,
      }
    }
    catch {
      // try next path
    }
  }
  throw new Error('Default email logo asset not found')
}

/** Load logo bytes for CID embedding so clients display the image without remote fetch. */
export async function loadInlineLogoAttachment(
  db: Db,
  brand: EmailBrandContext,
): Promise<InlineLogoAttachment | null> {
  try {
    if (brand.logoFileId) {
      const preview = await resolveImageDisplayPreview(db, brand.logoFileId)
      const ext = preview.mimeType === 'image/png' ? 'png' : preview.mimeType === 'image/jpeg' ? 'jpg' : 'img'
      return {
        filename: `logo.${ext}`,
        content: Buffer.from(preview.binaryData),
        contentType: preview.mimeType,
        cid: EMAIL_INLINE_LOGO_CID,
      }
    }
    return await readDefaultLogo()
  }
  catch (err) {
    console.warn('[mail] inline logo unavailable, using text fallback', (err as Error).message)
    return null
  }
}

/** Embed workspace logo as CID for notification HTML (Nuxt / Drizzle path). */
export async function embedInlineLogoForBrand(
  db: Db,
  html: string | undefined,
  brand: EmailBrandContext,
): Promise<{ html: string | undefined, attachments: InlineLogoAttachment[] }> {
  if (!html || !html.includes('<img')) {
    return { html, attachments: [] }
  }

  const logo = await loadInlineLogoAttachment(db, brand)
  if (!logo) {
    return { html, attachments: [] }
  }

  return {
    html: patchHtmlLogoToCid(html, brand.logoUrl, EMAIL_INLINE_LOGO_CID),
    attachments: [{ ...logo, contentDisposition: 'inline' }],
  }
}
