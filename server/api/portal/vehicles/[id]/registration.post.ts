import { useDb } from '../../../../db/client'
import {
  assertCanUploadVehicleDocument,
} from '../../../../services/file-access.service'
import { getVehicle, VehiclesServiceError } from '../../../../services/vehicles.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { assertPortalCustomerScope, requirePortalCustomer } from '../../../../utils/require-portal'
import { validateParams } from '../../../../utils/validate'
import { readEntityDocumentUpload } from '../../../../utils/entity-document-upload'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  let vehicle
  try {
    vehicle = await getVehicle(db, id)
  }
  catch (err) {
    if (err instanceof VehiclesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
    }
    throw err
  }

  assertPortalCustomerScope(event, user.customerId, vehicle.customerId, 'Vehicle')
  await assertCanUploadVehicleDocument(event, db, id)

  const file = await readEntityDocumentUpload(event, {
    db,
    ownerEntityType: 'vehicle',
    ownerEntityId: id,
    documentCategory: 'vehicle_registration',
    createdBy: user.id,
  })

  await writeAudit(event, {
    entityType: 'vehicle',
    entityId: id,
    action: 'portal.vehicle.document.registration.upload',
    afterData: { fileId: file.id, originalFilename: file.originalFilename },
    permissionKey: 'portal.read.own',
  })

  return { file }
})
