import { useDb } from '../../../../db/client'
import {
  assertCanUploadCustomerDocument,
  assertCustomerInScope,
} from '../../../../services/file-access.service'
import { removeEntityDocument } from '../../../../services/entity-documents.service'
import { writeAudit } from '../../../../services/audit.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'customers.update.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  await assertCustomerInScope(event, db, id)
  await assertCanUploadCustomerDocument(event, db, id)

  await removeEntityDocument(db, 'customer', id, 'tax_exemption_form')

  await writeAudit(event, {
    entityType: 'customer',
    entityId: id,
    action: 'customer.document.tax_exemption.remove',
    permissionKey: 'customers.update.all',
  })

  return { ok: true }
})
