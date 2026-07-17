import { useDb } from '../../../../db/client'
import {
  assertCanUploadVehicleDocument,
  assertVehicleInScope,
} from '../../../../services/file-access.service'
import { removeEntityDocument } from '../../../../services/entity-documents.service'
import { writeAudit } from '../../../../services/audit.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'vehicles.update.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  await assertVehicleInScope(event, db, id)
  await assertCanUploadVehicleDocument(event, db, id)

  await removeEntityDocument(db, 'vehicle', id, 'vehicle_registration')

  await writeAudit(event, {
    entityType: 'vehicle',
    entityId: id,
    action: 'vehicle.document.registration.remove',
    permissionKey: 'vehicles.update.all',
  })

  return { ok: true }
})
