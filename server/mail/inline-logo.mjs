import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const EMAIL_INLINE_LOGO_CID = 'logo@dorinc'

const DEFAULT_LOGO_PATHS = [
  join(process.cwd(), 'public/images/dorinc-icon-trans.png'),
  join(process.cwd(), '.output/public/images/dorinc-icon-trans.png'),
]

const BRANDED_LOGO_SRC_RE = /src="https?:\/\/[^"]+(?:\/api\/files\/[^"/]+\/preview|\/images\/dorinc-icon-trans\.png)"/g

/**
 * @returns {Promise<{ filename: string, content: Buffer, contentType: string, cid: string } | null>}
 */
export async function loadDefaultInlineLogoAttachment() {
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
  return null
}

/**
 * @param {string | undefined} html
 * @returns {Promise<{ html: string | undefined, attachments: Array<{ filename: string, content: Buffer, contentType: string, cid: string }> }>}
 */
export async function embedInlineLogoInHtml(html) {
  if (!html || !html.includes('<img')) {
    return { html, attachments: [] }
  }

  if (!html.match(BRANDED_LOGO_SRC_RE)) {
    return { html, attachments: [] }
  }

  const attachment = await loadDefaultInlineLogoAttachment()
  if (!attachment) {
    return { html, attachments: [] }
  }

  const patched = html.replace(
    BRANDED_LOGO_SRC_RE,
    `src="cid:${EMAIL_INLINE_LOGO_CID}"`,
  )

  return {
    html: patched,
    attachments: [attachment],
  }
}
