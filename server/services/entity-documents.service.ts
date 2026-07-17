import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { FileDocumentCategory } from '../../shared/document-categories'
import type { FileOwnerEntityType } from '../db/schema/files'
import { appFiles } from '../db/schema/files'
import {
  archiveFile,
  listFilesByOwner,
  uploadFile,
  type UploadFileInput,
} from './files.service'

export async function archiveDocumentsByCategory(
  db: Db,
  ownerEntityType: FileOwnerEntityType,
  ownerEntityId: string,
  documentCategory: FileDocumentCategory,
) {
  const rows = await db.select({ id: appFiles.id })
    .from(appFiles)
    .where(and(
      eq(appFiles.ownerEntityType, ownerEntityType),
      eq(appFiles.ownerEntityId, ownerEntityId),
      eq(appFiles.documentCategory, documentCategory),
      isNull(appFiles.archivedAt),
    ))

  for (const row of rows) {
    await archiveFile(db, row.id)
  }
}

export async function uploadEntityDocument(
  db: Db,
  input: UploadFileInput & { documentCategory: FileDocumentCategory },
  createdBy: string | null,
  opts: { replaceExisting?: boolean } = {},
) {
  if (opts.replaceExisting !== false) {
    await archiveDocumentsByCategory(
      db,
      input.ownerEntityType,
      input.ownerEntityId,
      input.documentCategory,
    )
  }

  return uploadFile(db, {
    ...input,
    fileKind: input.fileKind ?? 'attachment',
    documentCategory: input.documentCategory,
  }, createdBy)
}

export async function getLatestEntityDocument(
  db: Db,
  ownerEntityType: FileOwnerEntityType,
  ownerEntityId: string,
  documentCategory: FileDocumentCategory,
) {
  const rows = await listFilesByOwner(db, {
    ownerEntityType,
    ownerEntityId,
    documentCategory,
  })
  return rows[0] ?? null
}

export async function listEntityDocuments(
  db: Db,
  ownerEntityType: FileOwnerEntityType,
  ownerEntityId: string,
  documentCategory: FileDocumentCategory,
) {
  return listFilesByOwner(db, {
    ownerEntityType,
    ownerEntityId,
    documentCategory,
  })
}
