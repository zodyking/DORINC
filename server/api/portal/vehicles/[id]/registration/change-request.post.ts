import { readMultipartFormData } from 'h3'
import { useDb } from '../../../../db/client'
import {
  createDocumentChangeRequest,
  DocumentChangeServiceError,
} from '../../../../services/document-change-requests.service'
import { getPortalCustomer } from '../../../../services/portal.service'
import { FilesServiceError, maxUploadBytes } from '../../../../services/files.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePortalCustomer } from '../../../../utils/require-portal'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { portalDocumentChangeRequestSchema } from '../../../../../shared/validators/entity-documents'
import { eq } from 'drizzle-orm'
import { vehicles } from '../../../../db/schema/vehicles'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  requirePermission(event, 'portal.requests.own')
  const { id: vehicleId } = validateParams(event, idParamSchema)
  const db = useDb()

  await getPortalCustomer(db, user.customerId)

  const [vehicle] = await db.select({ id: vehicles.id, customerId: vehicles.customerId })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
    .limit(1)
  if (!vehicle || vehicle.customerId !== user.customerId) throw apiError(event, 'NOT_FOUND', 'Vehicle not found')

  const parts = await readMultipartFormData(event, { maxSize: maxUploadBytes() + 1024 * 1024 })
    .catch(() => null)
  if (!parts?.length) throw apiError(event, 'VALIDATION_ERROR', 'Expected a multipart/form-data upload')

  const actionRaw = parts.find(p => p.name === 'action' && p.data)?.data?.toString('utf8')
  const notesRaw = parts.find(p => p.name === 'notes' && p.data)?.data?.toString('utf8')
  const parsed = portalDocumentChangeRequestSchema.safeParse({
    action: actionRaw,
    notes: notesRaw,
  })
  if (!parsed.success) throw apiError(event, 'VALIDATION_ERROR', 'Invalid document change request')

  const filePart = parts.find(p => p.name === 'file' && p.filename)

  try {
    const request = await createDocumentChangeRequest(db, {
      customerId: user.customerId,
      submittedBy: user.id,
      vehicleId,
      documentCategory: 'vehicle_registration',
      action: parsed.data.action,
      customerNotes: parsed.data.notes ?? null,
      file: filePart
        ? {
            originalFilename: filePart.filename!,
            mimeType: filePart.type ?? 'application/octet-stream',
            data: filePart.data,
          }
        : undefined,
    })

    await writeAudit(event, {
      entityType: 'document_change_request',
      entityId: request.id,
      action: 'portal.vehicle.document.registration.change_request',
      afterData: {
        vehicleId,
        action: request.action,
        status: request.status,
      },
      permissionKey: 'portal.requests.own',
    })

    return {
      id: request.id,
      status: request.status,
      action: request.action,
    }
  }
  catch (err) {
    if (err instanceof DocumentChangeServiceError) {
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
      if (err.code === 'PENDING_EXISTS') {
        throw apiError(event, 'CONFLICT', 'A document change request is already pending review')
      }
      if (err.code === 'FILE_REQUIRED') {
        throw apiError(event, 'VALIDATION_ERROR', 'A replacement file is required for update requests')
      }
    }
    if (err instanceof FilesServiceError) {
      if (err.code === 'FILE_TOO_LARGE') throw apiError(event, 'VALIDATION_ERROR', err.message)
      if (err.code === 'MIME_NOT_ALLOWED' || err.code === 'CONTENT_MISMATCH' || err.code === 'EMPTY_FILE') {
        throw apiError(event, 'VALIDATION_ERROR', err.message)
      }
    }
    throw err
  }
})
