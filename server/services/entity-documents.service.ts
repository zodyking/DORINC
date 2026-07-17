import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { FileDocumentActiveCategory, FileDocumentCategory } from '../../shared/document-categories'
import { toPendingDocumentCategory } from '../../shared/document-categories'
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

export async function removeEntityDocument(
  db: Db,
  ownerEntityType: FileOwnerEntityType,
  ownerEntityId: string,
  documentCategory: FileDocumentActiveCategory,
) {
  await archiveDocumentsByCategory(db, ownerEntityType, ownerEntityId, documentCategory)
  await archiveDocumentsByCategory(
    db,
    ownerEntityType,
    ownerEntityId,
    toPendingDocumentCategory(documentCategory),
  )
}

/** Promote a pending review file to the active document category. */
export async function promotePendingEntityDocument(
  db: Db,
  ownerEntityType: FileOwnerEntityType,
  ownerEntityId: string,
  activeCategory: FileDocumentActiveCategory,
  pendingFileId: string,
) {
  await archiveDocumentsByCategory(db, ownerEntityType, ownerEntityId, activeCategory)
  await archiveDocumentsByCategory(
    db,
    ownerEntityType,
    ownerEntityId,
    toPendingDocumentCategory(activeCategory),
  )

  await db.update(appFiles)
    .set({ documentCategory: activeCategory })
    .where(and(
      eq(appFiles.id, pendingFileId),
      eq(appFiles.ownerEntityType, ownerEntityType),
      eq(appFiles.ownerEntityId, ownerEntityId),
      isNull(appFiles.archivedAt),
    ))
}

export async function getLatestEntityDocument(
  db: Db,
  ownerEntityType: FileOwnerEntityType,
  ownerEntityId: string,
  documentCategory: FileDocumentActiveCategory,
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

export async function countPendingDocumentChangeRequests(
  db: Db,
  ownerEntityType: FileOwnerEntityType,
  ownerEntityId: string,
  documentCategory: FileDocumentActiveCategory,
) {
  const { documentChangeRequests } = await import('../db/schema/portal-requests')
  const conditions = [
    eq(documentChangeRequests.documentCategory, documentCategory),
    eq(documentChangeRequests.status, 'pending'),
  ]
  if (ownerEntityType === 'vehicle') {
    conditions.push(eq(documentChangeRequests.vehicleId, ownerEntityId))
  }
  else {
    conditions.push(eq(documentChangeRequests.customerId, ownerEntityId))
    conditions.push(isNull(documentChangeRequests.vehicleId))
  }

  const [row] = await db.select({ id: documentChangeRequests.id })
    .from(documentChangeRequests)
    .where(and(...conditions))
    .limit(1)
  return row ? 1 : 0
}
