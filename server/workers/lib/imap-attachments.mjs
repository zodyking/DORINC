import { createHash } from 'node:crypto'
import {
  isInlineEmailPart,
  resolveEmailAttachmentMime,
  resolveInlineImageMime,
} from '../../../shared/email-attachment-mime.mjs'

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

export function normalizeContentId(raw) {
  return String(raw ?? '')
    .replace(/^cid:/i, '')
    .replace(/^<|>$/g, '')
    .trim()
    .toLowerCase()
}

function attachmentContentId(attachment) {
  const raw = attachment.cid ?? attachment.contentId
  if (!raw?.trim()) return null
  return normalizeContentId(raw)
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

async function listExistingInlineCids(pool, messageId) {
  const { rows } = await pool.query(
    `SELECT content_id FROM app_files
     WHERE owner_entity_type = 'message'
       AND owner_entity_id = $1
       AND file_kind = 'inline'
       AND archived_at IS NULL
       AND content_id IS NOT NULL`,
    [messageId],
  )
  return new Set(rows.map(row => normalizeContentId(row.content_id)))
}

async function listExistingAttachmentHashes(pool, messageId) {
  const { rows } = await pool.query(
    `SELECT sha256_hash, file_kind FROM app_files
     WHERE owner_entity_type = 'message'
       AND owner_entity_id = $1
       AND archived_at IS NULL`,
    [messageId],
  )
  const attachmentHashes = new Set()
  const inlineHashes = new Set()
  for (const row of rows) {
    if (row.file_kind === 'inline') inlineHashes.add(row.sha256_hash)
    if (row.file_kind === 'attachment') attachmentHashes.add(row.sha256_hash)
  }
  return { attachmentHashes, inlineHashes }
}

async function insertMessageFile(pool, {
  messageId,
  fileKind,
  filename,
  mimeType,
  content,
  contentId = null,
}) {
  const sha256 = createHash('sha256').update(content).digest('hex')
  await pool.query(
    `INSERT INTO app_files (
       owner_entity_type, owner_entity_id, file_kind, original_filename,
       mime_type, file_size_bytes, sha256_hash, binary_data, content_id, created_by
     ) VALUES ('message', $1, $2, $3, $4, $5, $6, $7, $8, NULL)`,
    [
      messageId,
      fileKind,
      filename,
      mimeType,
      content.length,
      sha256,
      content,
      contentId,
    ],
  )
  return sha256
}

export async function persistInboundAttachments(pool, messageId, attachments = [], opts = {}) {
  const perFileLimit = await maxAttachmentBytes(pool)
  const totalLimit = perFileLimit * 2
  let totalBytes = 0
  let persisted = 0

  let existingInlineCids = new Set()
  let existingAttachmentHashes = new Set()
  let existingInlineHashes = new Set()
  if (opts.skipExisting) {
    existingInlineCids = await listExistingInlineCids(pool, messageId)
    const hashes = await listExistingAttachmentHashes(pool, messageId)
    existingAttachmentHashes = hashes.attachmentHashes
    existingInlineHashes = hashes.inlineHashes
  }

  for (const [index, attachment] of attachments.slice(0, 20).entries()) {
    if (!attachment.content?.length) continue

    if (isInlineEmailPart(attachment)) {
      const contentId = attachmentContentId(attachment)
      const sniffed = sniffAttachmentMime(attachment.content)
      const mimeType = resolveInlineImageMime(attachment.contentType, sniffed, ALLOWED_ATTACHMENT_MIMES)
      if (!contentId || !mimeType) continue

      const sha256 = createHash('sha256').update(attachment.content).digest('hex')
      if (opts.skipExisting && (existingInlineCids.has(contentId) || existingInlineHashes.has(sha256))) continue

      totalBytes += attachment.content.length
      if (attachment.content.length > perFileLimit || totalBytes > totalLimit) {
        console.warn('[imap-sync] skipped oversized inline image', { messageId, contentId })
        if (totalBytes > totalLimit) break
        continue
      }

      await insertMessageFile(pool, {
        messageId,
        fileKind: 'inline',
        filename: safeAttachmentName(attachment.filename, index),
        mimeType,
        content: attachment.content,
        contentId,
      })
      persisted++
      existingInlineCids.add(contentId)
      existingInlineHashes.add(sha256)
      continue
    }

    const sniffed = sniffAttachmentMime(attachment.content)
    const mimeType = resolveEmailAttachmentMime(
      attachment.contentType,
      attachment.filename,
      sniffed,
      ALLOWED_ATTACHMENT_MIMES,
    )
    if (!mimeType) {
      console.warn('[imap-sync] skipped unsafe attachment', {
        messageId,
        filename: attachment.filename,
        mimeType: attachment.contentType,
      })
      continue
    }

    const sha256 = createHash('sha256').update(attachment.content).digest('hex')
    if (opts.skipExisting && existingAttachmentHashes.has(sha256)) continue

    totalBytes += attachment.content.length
    if (attachment.content.length > perFileLimit || totalBytes > totalLimit) {
      console.warn('[imap-sync] skipped oversized attachment', {
        messageId,
        filename: attachment.filename,
      })
      if (totalBytes > totalLimit) break
      continue
    }

    await insertMessageFile(pool, {
      messageId,
      fileKind: 'attachment',
      filename: safeAttachmentName(attachment.filename, index),
      mimeType,
      content: attachment.content,
    })
    persisted++
    existingAttachmentHashes.add(sha256)
  }

  return persisted
}

export async function repairInboundEmailMedia(pool, messageId, input = {}) {
  if (!input.attachments?.length) return 0
  return persistInboundAttachments(pool, messageId, input.attachments, { skipExisting: true })
}
