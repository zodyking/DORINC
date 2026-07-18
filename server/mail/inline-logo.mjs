import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const EMAIL_INLINE_LOGO_CID = 'logo@dorinc'

const DEFAULT_LOGO_PATHS = [
  join(process.cwd(), 'public/images/dorinc-icon-trans.png'),
  join(process.cwd(), '.output/public/images/dorinc-icon-trans.png'),
]

const BRANDED_LOGO_SRC_RE = /src="https?:\/\/[^"]+(?:\/api\/files\/[^"/]+\/preview|\/images\/dorinc-icon-trans\.png)"/g
const LOGO_FILE_ID_RE = /\/api\/files\/([^"/]+)\/preview/

const EMAIL_SAFE_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif'])

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
 * @param {import('pg').Pool} pool
 * @param {string} fileId
 */
async function loadInlineLogoFromPool(pool, fileId) {
  const { rows } = await pool.query(
    `SELECT f.binary_data, f.mime_type, f.file_kind
     FROM app_files f
     WHERE (f.id = $1 OR f.source_file_id = $1)
       AND f.archived_at IS NULL
       AND f.mime_type LIKE 'image/%'
     ORDER BY
       CASE WHEN f.file_kind = 'preview' THEN 0 WHEN f.id = $1 THEN 1 ELSE 2 END,
       f.created_at DESC
     LIMIT 1`,
    [fileId],
  )

  const row = rows[0]
  if (!row?.binary_data) return null

  const mimeType = String(row.mime_type ?? 'image/png')
  if (!EMAIL_SAFE_IMAGE_MIMES.has(mimeType)) {
    return null
  }

  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/jpeg' ? 'jpg' : 'gif'
  return {
    filename: `logo.${ext}`,
    content: Buffer.from(row.binary_data),
    contentType: mimeType,
    cid: EMAIL_INLINE_LOGO_CID,
  }
}

/**
 * @param {string | undefined} html
 * @param {{ pool?: import('pg').Pool }} [opts]
 * @returns {Promise<{ html: string | undefined, attachments: Array<{ filename: string, content: Buffer, contentType: string, cid: string, contentDisposition?: string }> }>}
 */
export async function embedInlineLogoInHtml(html, opts = {}) {
  if (!html || !html.includes('<img')) {
    return { html, attachments: [] }
  }

  if (!html.match(BRANDED_LOGO_SRC_RE)) {
    return { html, attachments: [] }
  }

  const fileId = html.match(LOGO_FILE_ID_RE)?.[1]
  let attachment = null
  if (opts.pool && fileId) {
    attachment = await loadInlineLogoFromPool(opts.pool, fileId)
  }
  if (!attachment) {
    attachment = await loadDefaultInlineLogoAttachment()
  }
  if (!attachment) {
    return { html, attachments: [] }
  }

  const patched = html.replace(
    BRANDED_LOGO_SRC_RE,
    `src="cid:${EMAIL_INLINE_LOGO_CID}"`,
  )

  return {
    html: patched,
    attachments: [{
      ...attachment,
      contentDisposition: 'inline',
    }],
  }
}
