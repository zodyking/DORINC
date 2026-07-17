import { useDb } from '../../../../db/client'
import { getLatestEntityDocument } from '../../../../services/entity-documents.service'
import {
  assertCanUploadVehicleDocument,
} from '../../../../services/file-access.service'
import { getVehicle, VehiclesServiceError } from '../../../../services/vehicles.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { readEntityDocumentUpload } from '../../../../utils/entity-document-upload'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'vehicles.update.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    await getVehicle(db, id)
  }
  catch (err) {
    if (err instanceof VehiclesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
    }
    throw err
  }

  await assertCanUploadVehicleDocument(event, db, id)

  const file = await readEntityDocumentUpload(event, {
    db,
    ownerEntityType: 'vehicle',
    ownerEntityId: id,
    documentCategory: 'vehicle_registration',
    createdBy: actor.id,
  })

  await writeAudit(event, {
    entityType: 'vehicle',
    entityId: id,
    action: 'vehicle.document.registration.upload',
    afterData: { fileId: file.id, originalFilename: file.originalFilename },
    permissionKey: 'vehicles.update.all',
  })

  return { file }
})
