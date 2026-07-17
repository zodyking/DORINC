import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { FileDocumentActiveCategory } from '../../shared/document-categories'
import {
  documentCategoryLabel,
  toPendingDocumentCategory,
} from '../../shared/document-categories'
import {
  DOCUMENT_CHANGE_ACTIONS,
  documentChangeRequests,
} from '../db/schema/portal-requests'
import { vehicles } from '../db/schema/vehicles'
import {
  promotePendingEntityDocument,
  removeEntityDocument,
  uploadEntityDocument,
} from './entity-documents.service'
import { archiveFile } from './files.service'

export type DocumentChangeServiceErrorCode
  = 'NOT_FOUND'
    | 'PORTAL_DISABLED'
    | 'VEHICLE_NOT_FOUND'
    | 'PENDING_EXISTS'
    | 'FILE_REQUIRED'
    | 'NOT_PENDING'

export class DocumentChangeServiceError extends Error {
  constructor(public readonly code: DocumentChangeServiceErrorCode, message?: string) {
    super(message ?? code)
  }
}

export interface CreateDocumentChangeRequestInput {
  customerId: string
  submittedBy: string
  vehicleId?: string | null
  documentCategory: FileDocumentActiveCategory
  action: typeof DOCUMENT_CHANGE_ACTIONS[number]
  customerNotes?: string | null
  file?: {
    originalFilename: string
    mimeType: string
    data: Buffer
  }
}

async function assertNoPendingRequest(
  db: Db,
  input: Pick<CreateDocumentChangeRequestInput, 'customerId' | 'vehicleId' | 'documentCategory'>,
) {
  const conditions = [
    eq(documentChangeRequests.customerId, input.customerId),
    eq(documentChangeRequests.documentCategory, input.documentCategory),
    eq(documentChangeRequests.status, 'pending'),
  ]
  if (input.vehicleId) {
    conditions.push(eq(documentChangeRequests.vehicleId, input.vehicleId))
  }
  else {
    conditions.push(isNull(documentChangeRequests.vehicleId))
  }

  const [existing] = await db.select({ id: documentChangeRequests.id })
    .from(documentChangeRequests)
    .where(and(...conditions))
    .limit(1)
  if (existing) throw new DocumentChangeServiceError('PENDING_EXISTS')
}

export async function createDocumentChangeRequest(db: Db, input: CreateDocumentChangeRequestInput) {
  if (input.action === 'replace' && !input.file) {
    throw new DocumentChangeServiceError('FILE_REQUIRED')
  }

  if (input.vehicleId) {
    const [vehicle] = await db.select({ id: vehicles.id, customerId: vehicles.customerId })
      .from(vehicles)
      .where(eq(vehicles.id, input.vehicleId))
      .limit(1)
    if (!vehicle || vehicle.customerId !== input.customerId) {
      throw new DocumentChangeServiceError('VEHICLE_NOT_FOUND')
    }
  }

  await assertNoPendingRequest(db, input)

  let pendingFileId: string | null = null
  if (input.action === 'replace' && input.file) {
    const ownerEntityType = input.vehicleId ? 'vehicle' as const : 'customer' as const
    const ownerEntityId = input.vehicleId ?? input.customerId
    const pending = await uploadEntityDocument(db, {
      ownerEntityType,
      ownerEntityId,
      documentCategory: toPendingDocumentCategory(input.documentCategory),
      originalFilename: input.file.originalFilename,
      mimeType: input.file.mimeType,
      data: input.file.data,
    }, input.submittedBy, { replaceExisting: true })
    pendingFileId = pending.id
  }

  const [request] = await db.insert(documentChangeRequests).values({
    customerId: input.customerId,
    submittedBy: input.submittedBy,
    vehicleId: input.vehicleId ?? null,
    documentCategory: input.documentCategory,
    action: input.action,
    pendingFileId,
    customerNotes: input.customerNotes?.trim() || null,
  }).returning()

  return request!
}

export async function approveDocumentChangeRequest(
  db: Db,
  id: string,
  actorId: string,
  reason?: string | null,
) {
  const [pending] = await db.select().from(documentChangeRequests).where(eq(documentChangeRequests.id, id))
  if (!pending) throw new DocumentChangeServiceError('NOT_FOUND')
  if (pending.status !== 'pending') throw new DocumentChangeServiceError('NOT_PENDING')

  const ownerEntityType = pending.vehicleId ? 'vehicle' as const : 'customer' as const
  const ownerEntityId = pending.vehicleId ?? pending.customerId

  if (pending.action === 'remove') {
    await removeEntityDocument(db, ownerEntityType, ownerEntityId, pending.documentCategory)
    if (pending.pendingFileId) {
      try { await archiveFile(db, pending.pendingFileId) } catch { /* already archived */ }
    }
  }
  else if (pending.action === 'replace') {
    if (!pending.pendingFileId) throw new DocumentChangeServiceError('FILE_REQUIRED')
    await promotePendingEntityDocument(
      db,
      ownerEntityType,
      ownerEntityId,
      pending.documentCategory,
      pending.pendingFileId,
    )
  }

  const [row] = await db.update(documentChangeRequests).set({
    status: 'approved',
    reviewedBy: actorId,
    reviewedAt: new Date(),
    reviewReason: reason?.trim() || null,
    updatedAt: new Date(),
  }).where(eq(documentChangeRequests.id, id)).returning()

  return row!
}

export async function rejectDocumentChangeRequest(
  db: Db,
  id: string,
  actorId: string,
  reason: string,
) {
  const [pending] = await db.select().from(documentChangeRequests).where(eq(documentChangeRequests.id, id))
  if (!pending) throw new DocumentChangeServiceError('NOT_FOUND')
  if (pending.status !== 'pending') throw new DocumentChangeServiceError('NOT_PENDING')

  if (pending.pendingFileId) {
    try { await archiveFile(db, pending.pendingFileId) } catch { /* ignore */ }
  }

  const [row] = await db.update(documentChangeRequests).set({
    status: 'rejected',
    reviewedBy: actorId,
    reviewedAt: new Date(),
    reviewReason: reason.trim(),
    updatedAt: new Date(),
  }).where(eq(documentChangeRequests.id, id)).returning()

  return row!
}

export function documentChangeRequestTitle(
  category: FileDocumentActiveCategory,
  action: typeof DOCUMENT_CHANGE_ACTIONS[number],
): string {
  const label = documentCategoryLabel(category)
  return action === 'remove' ? `${label} — removal request` : `${label} — update request`
}
