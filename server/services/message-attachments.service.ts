import { createHash } from 'node:crypto'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appFiles } from '../db/schema/files'
import {
  ALLOWED_UPLOAD_MIMES,
  FilesServiceError,
  getFileWithData,
  maxUploadBytes,
  sniffMime,
  uploadFile,
} from './files.service'
import { messages } from '../db/schema/messages'

export interface OutboundMessageAttachmentInput {
  filename: string
  mimeType: string
  data: Buffer
}

export interface MessageAttachmentMeta {
  id: string
  filename: string
  mimeType: string
  fileSizeBytes: number
}

const HEIC_EQUIVALENTS = new Set(['image/heic', 'image/heif'])

const DM_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

function assertAttachmentMime(mimeType: string, data: Buffer, allowed: Set<string>): void {
  const mime = mimeType.toLowerCase()
  if (!allowed.has(mime)) throw new Error('INVALID_ATTACHMENT')
  const sniffed = sniffMime(data)
  const accepted = HEIC_EQUIVALENTS.has(mime) ? HEIC_EQUIVALENTS : new Set([mime])
  if (!sniffed || !accepted.has(sniffed)) throw new Error('INVALID_ATTACHMENT')
}

/** Validate outbound DM image attachments before persisting a message. */
export function assertValidDmAttachments(attachments: OutboundMessageAttachmentInput[]): void {
  const limit = maxUploadBytes()
  for (const att of attachments) {
    if (!att.data.length) throw new Error('INVALID_ATTACHMENT')
    if (att.data.length > limit) throw new Error('ATTACHMENT_TOO_LARGE')
    assertAttachmentMime(att.mimeType, att.data, DM_IMAGE_MIMES)
  }
}

/** Validate outbound email-style attachments (images + PDF). */
export function assertValidMessageAttachments(attachments: OutboundMessageAttachmentInput[]): void {
  const limit = maxUploadBytes()
  for (const att of attachments) {
    if (!att.data.length) throw new Error('INVALID_ATTACHMENT')
    if (att.data.length > limit) throw new Error('ATTACHMENT_TOO_LARGE')
    assertAttachmentMime(att.mimeType, att.data, ALLOWED_UPLOAD_MIMES)
  }
}

/** Persist attachments against a staff message row. */
export async function persistMessageAttachments(
  db: Db,
  messageId: string,
  actorUserId: string,
  attachments: OutboundMessageAttachmentInput[],
): Promise<MessageAttachmentMeta[]> {
  const saved: MessageAttachmentMeta[] = []
  for (const att of attachments) {
    const file = await uploadFile(db, {
      ownerEntityType: 'message',
      ownerEntityId: messageId,
      fileKind: 'attachment',
      originalFilename: att.filename,
      mimeType: att.mimeType.toLowerCase(),
      data: att.data,
    }, actorUserId)
    saved.push({
      id: file.id,
      filename: file.originalFilename,
      mimeType: file.mimeType,
      fileSizeBytes: file.fileSizeBytes,
    })
  }
  return saved
}

/** Batch-load attachment metadata for message rows. */
export async function listAttachmentsByMessageIds(
  db: Db,
  messageIds: string[],
): Promise<Map<string, MessageAttachmentMeta[]>> {
  const result = new Map<string, MessageAttachmentMeta[]>()
  const uniqueIds = [...new Set(messageIds.filter(Boolean))]
  if (!uniqueIds.length) return result

  const rows = await db.select({
    id: appFiles.id,
    ownerEntityId: appFiles.ownerEntityId,
    originalFilename: appFiles.originalFilename,
    mimeType: appFiles.mimeType,
    fileSizeBytes: appFiles.fileSizeBytes,
  })
    .from(appFiles)
    .where(and(
      eq(appFiles.ownerEntityType, 'message'),
      eq(appFiles.fileKind, 'attachment'),
      isNull(appFiles.archivedAt),
      inArray(appFiles.ownerEntityId, uniqueIds),
    ))

  for (const row of rows) {
    const list = result.get(row.ownerEntityId) ?? []
    list.push({
      id: row.id,
      filename: row.originalFilename,
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes,
    })
    result.set(row.ownerEntityId, list)
  }

  return result
}

export function attachmentSha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Load an attachment belonging to any conversation message (team, DM, or email). */
export async function getMessageAttachment(
  db: Db,
  conversationId: string,
  messageId: string,
  fileId: string,
) {
  const [owned] = await db.select({ id: appFiles.id })
    .from(appFiles)
    .innerJoin(messages, eq(messages.id, appFiles.ownerEntityId))
    .where(and(
      eq(appFiles.id, fileId),
      eq(appFiles.ownerEntityType, 'message'),
      eq(appFiles.ownerEntityId, messageId),
      eq(messages.conversationId, conversationId),
      isNull(appFiles.archivedAt),
    ))
    .limit(1)

  if (!owned) throw new FilesServiceError('NOT_FOUND')
  return getFileWithData(db, fileId)
}
