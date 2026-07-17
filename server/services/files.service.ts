import { createHash } from 'node:crypto'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { FileKind, FileOwnerEntityType } from '../db/schema/files'
import { appFiles } from '../db/schema/files'
import { USER_UPLOAD_FILE_KINDS } from '../../shared/files'
import { resolveAllowedAttachmentMime } from '../../shared/email-attachment-mime'
import { getMaxUploadMb } from './app-config.service'

export type FilesServiceErrorCode
  = 'NOT_FOUND'
    | 'ALREADY_ARCHIVED'
    | 'FILE_TOO_LARGE'
    | 'MIME_NOT_ALLOWED'
    | 'CONTENT_MISMATCH'
    | 'EMPTY_FILE'

export class FilesServiceError extends Error {
  constructor(public readonly code: FilesServiceErrorCode, message?: string) {
    super(message ?? code)
  }
}

/** Allowed upload MIME types (SPEC §8 — service log photos, PDFs, attachments). */
export const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
])

export function maxUploadBytes(): number {
  return getMaxUploadMb() * 1024 * 1024
}

/** Magic-number sniff for the formats we accept — declared MIME must match the bytes. */
export function sniffMime(data: Buffer): string | null {
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

export interface UploadFileInput {
  ownerEntityType: FileOwnerEntityType
  ownerEntityId: string
  fileKind?: FileKind
  sourceFileId?: string | null
  originalFilename: string
  mimeType: string
  data: Buffer
  width?: number | null
  height?: number | null
  /** Trusted server-generated content (PDF renders, thumbnails) skips the MIME allowlist. */
  trusted?: boolean
  /** Content-ID for inline email images. */
  contentId?: string | null
}

/** Columns safe for list views — never the blob (SPEC §8). */
const META_COLUMNS = {
  id: appFiles.id,
  ownerEntityType: appFiles.ownerEntityType,
  ownerEntityId: appFiles.ownerEntityId,
  fileKind: appFiles.fileKind,
  sourceFileId: appFiles.sourceFileId,
  originalFilename: appFiles.originalFilename,
  mimeType: appFiles.mimeType,
  fileSizeBytes: appFiles.fileSizeBytes,
  sha256Hash: appFiles.sha256Hash,
  contentId: appFiles.contentId,
  width: appFiles.width,
  height: appFiles.height,
  createdBy: appFiles.createdBy,
  createdAt: appFiles.createdAt,
  archivedAt: appFiles.archivedAt,
}

export async function uploadFile(db: Db, input: UploadFileInput, createdBy: string | null) {
  if (!input.data.length) throw new FilesServiceError('EMPTY_FILE', 'Uploaded file is empty')

  const limit = maxUploadBytes()
  if (input.data.length > limit) {
    throw new FilesServiceError('FILE_TOO_LARGE', `File exceeds the ${Math.floor(limit / 1024 / 1024)} MB upload limit`)
  }

  if (!input.trusted) {
    const sniffed = sniffMime(input.data)
    const resolvedMime = resolveAllowedAttachmentMime(input.mimeType, sniffed, ALLOWED_UPLOAD_MIMES)
    if (!resolvedMime) {
      throw new FilesServiceError(
        'MIME_NOT_ALLOWED',
        `File type ${input.mimeType} is not allowed`,
      )
    }
    input = { ...input, mimeType: resolvedMime }
  }

  const sha256Hash = createHash('sha256').update(input.data).digest('hex')

  const [row] = await db.insert(appFiles).values({
    ownerEntityType: input.ownerEntityType,
    ownerEntityId: input.ownerEntityId,
    fileKind: input.fileKind ?? 'attachment',
    sourceFileId: input.sourceFileId ?? null,
    originalFilename: input.originalFilename,
    mimeType: input.mimeType,
    fileSizeBytes: input.data.length,
    sha256Hash,
    contentId: input.contentId ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    binaryData: input.data,
    createdBy,
  }).returning(META_COLUMNS)

  return row!
}

export async function getFileMeta(db: Db, id: string) {
  const [row] = await db.select(META_COLUMNS).from(appFiles).where(eq(appFiles.id, id))
  if (!row) throw new FilesServiceError('NOT_FOUND')
  return row
}

export async function getFileWithData(db: Db, id: string) {
  const [row] = await db.select().from(appFiles).where(eq(appFiles.id, id))
  if (!row) throw new FilesServiceError('NOT_FOUND')
  return row
}

export interface ListFilesFilter {
  ownerEntityType: FileOwnerEntityType
  ownerEntityId: string
  fileKind?: FileKind
  includeArchived?: boolean
}

export async function listFilesByOwner(db: Db, filter: ListFilesFilter) {
  const conditions = [
    eq(appFiles.ownerEntityType, filter.ownerEntityType),
    eq(appFiles.ownerEntityId, filter.ownerEntityId),
  ]
  if (filter.fileKind) conditions.push(eq(appFiles.fileKind, filter.fileKind))
  if (!filter.includeArchived) conditions.push(isNull(appFiles.archivedAt))

  return db.select(META_COLUMNS).from(appFiles)
    .where(and(...conditions))
    .orderBy(desc(appFiles.createdAt))
}

/** Lists user-uploaded files only — excludes thumbnail/preview derivatives. */
export async function listUserUploadsByOwner(db: Db, filter: Omit<ListFilesFilter, 'fileKind'>) {
  const conditions = [
    eq(appFiles.ownerEntityType, filter.ownerEntityType),
    eq(appFiles.ownerEntityId, filter.ownerEntityId),
    inArray(appFiles.fileKind, [...USER_UPLOAD_FILE_KINDS]),
  ]
  if (!filter.includeArchived) conditions.push(isNull(appFiles.archivedAt))

  return db.select(META_COLUMNS).from(appFiles)
    .where(and(...conditions))
    .orderBy(desc(appFiles.createdAt))
}

export async function archiveFile(db: Db, id: string) {
  const meta = await getFileMeta(db, id)
  if (meta.archivedAt) throw new FilesServiceError('ALREADY_ARCHIVED')
  const [row] = await db.update(appFiles)
    .set({ archivedAt: new Date() })
    .where(eq(appFiles.id, id))
    .returning(META_COLUMNS)
  return row!
}

/** Archives a file and any thumbnail/preview rows generated from it. */
export async function archiveFileWithDerivatives(db: Db, id: string) {
  const meta = await getFileMeta(db, id)
  if (meta.archivedAt) throw new FilesServiceError('ALREADY_ARCHIVED')

  const now = new Date()
  await db.update(appFiles)
    .set({ archivedAt: now })
    .where(or(
      eq(appFiles.id, id),
      eq(appFiles.sourceFileId, id),
    ))

  const [row] = await db.select(META_COLUMNS).from(appFiles).where(eq(appFiles.id, id))
  if (!row) throw new FilesServiceError('NOT_FOUND')
  return row
}

const BROWSER_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/** Returns bytes suitable for inline browser display — prefers webp preview derivatives / converts HEIC. */
export async function resolveImageDisplayPreview(db: Db, fileId: string) {
  const original = await getFileWithData(db, fileId)

  const [derivative] = await db.select({ id: appFiles.id })
    .from(appFiles)
    .where(and(
      eq(appFiles.sourceFileId, fileId),
      eq(appFiles.fileKind, 'preview'),
      isNull(appFiles.archivedAt),
    ))
    .limit(1)

  if (derivative) {
    const preview = await getFileWithData(db, derivative.id)
    return {
      binaryData: preview.binaryData,
      mimeType: preview.mimeType,
      fileSizeBytes: preview.fileSizeBytes,
    }
  }

  if (BROWSER_IMAGE_MIMES.has(original.mimeType)) {
    return {
      binaryData: original.binaryData,
      mimeType: original.mimeType,
      fileSizeBytes: original.fileSizeBytes,
    }
  }

  if (!original.mimeType.startsWith('image/')) {
    return {
      binaryData: original.binaryData,
      mimeType: original.mimeType,
      fileSizeBytes: original.fileSizeBytes,
    }
  }

  const sharp = (await import('sharp')).default
  const webp = await sharp(original.binaryData, { failOn: 'error' })
    .rotate()
    .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer()

  return {
    binaryData: webp,
    mimeType: 'image/webp',
    fileSizeBytes: webp.length,
  }
}
