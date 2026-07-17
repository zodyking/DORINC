import { useDb } from '../../../db/client'
import {
  assertCanUploadCustomerDocument,
  assertCustomerInScope,
} from '../../../services/file-access.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { readEntityDocumentUpload } from '../../../utils/entity-document-upload'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'customers.update.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  await assertCustomerInScope(event, db, id)
  await assertCanUploadCustomerDocument(event, db, id)

  const file = await readEntityDocumentUpload(event, {
    db,
    ownerEntityType: 'customer',
    ownerEntityId: id,
    documentCategory: 'tax_exemption_form',
    createdBy: actor.id,
  })

  await writeAudit(event, {
    entityType: 'customer',
    entityId: id,
    action: 'customer.document.tax_exemption.upload',
    afterData: { fileId: file.id, originalFilename: file.originalFilename },
    permissionKey: 'customers.update.all',
  })

  return { file }
})
