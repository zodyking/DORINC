import { createHash } from 'node:crypto'

const ALLOWED_ATTACHMENT_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
])

export function sniffAttachmentMime(data) {
  if (data.length >= 3 && data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) return 'image/jpeg'
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png'
  if (data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (data.length >= 6 && ['GIF87a', 'GIF89a'].includes(data.subarray(0, 6).toString('latin1'))) return 'image/gif'
  if (data.length >= 12 && data.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = data.subarray(8, 12).toString('latin1')
    if (brand.startsWith('hei') || brand.startsWith('mif') || brand.startsWith('msf')) return 'image/heic'
  }
  if (data.length >= 5 && data.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf'
  return null
}

export function safeAttachmentName(filename, index) {
  const leaf = String(filename || `attachment-${index + 1}`)
    .split(/[\\/]/)
    .pop()
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '_')
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0)
      return code < 32 || code === 127 ? '_' : char
    })
    .join('')
    .trim()
  return (leaf || `attachment-${index + 1}`).slice(0, 240)
}

async function maxAttachmentBytes(pool) {
  const envMb = Number(process.env.MAX_UPLOAD_MB)
  if (Number.isFinite(envMb) && envMb > 0) return envMb * 1024 * 1024

  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = 'app.max_upload_mb' LIMIT 1`,
  )
  const configuredMb = Number(rows[0]?.value?.mb)
  return (Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : 25) * 1024 * 1024
}

export async function persistInboundAttachments(pool, messageId, attachments = []) {
  const perFileLimit = await maxAttachmentBytes(pool)
  const totalLimit = perFileLimit * 2
  let totalBytes = 0
  let persisted = 0

  for (const [index, attachment] of attachments.slice(0, 20).entries()) {
    // Mailparser embeds related CID images into the HTML body as data URIs.
    if (attachment.related || !attachment.content?.length) continue

    totalBytes += attachment.content.length
    if (attachment.content.length > perFileLimit || totalBytes > totalLimit) {
      console.warn('[imap-sync] skipped oversized attachment', {
        messageId,
        filename: attachment.filename,
      })
      if (totalBytes > totalLimit) break
      continue
    }

    const mimeType = String(attachment.contentType || '').toLowerCase()
    const sniffed = sniffAttachmentMime(attachment.content)
    const accepted = mimeType === 'image/heif'
      ? ['image/heic', 'image/heif']
      : [mimeType]
    if (!ALLOWED_ATTACHMENT_MIMES.has(mimeType) || !sniffed || !accepted.includes(sniffed)) {
      console.warn('[imap-sync] skipped unsafe attachment', {
        messageId,
        filename: attachment.filename,
        mimeType,
      })
      continue
    }

    const sha256 = createHash('sha256').update(attachment.content).digest('hex')
    await pool.query(
      `INSERT INTO app_files (
         owner_entity_type, owner_entity_id, file_kind, original_filename,
         mime_type, file_size_bytes, sha256_hash, binary_data, created_by
       ) VALUES ('message', $1, 'attachment', $2, $3, $4, $5, $6, NULL)`,
      [
        messageId,
        safeAttachmentName(attachment.filename, index),
        mimeType,
        attachment.content.length,
        sha256,
        attachment.content,
      ],
    )
    persisted++
  }

  return persisted
}
