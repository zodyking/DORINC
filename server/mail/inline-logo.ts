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
