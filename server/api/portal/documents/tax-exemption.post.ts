import { useDb } from '../../../db/client'
import {
  assertCanUploadCustomerDocument,
} from '../../../services/file-access.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePortalCustomer } from '../../../utils/require-portal'
import { readEntityDocumentUpload } from '../../../utils/entity-document-upload'

export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  const db = useDb()

  await assertCanUploadCustomerDocument(event, db, user.customerId)

  const file = await readEntityDocumentUpload(event, {
    db,
    ownerEntityType: 'customer',
    ownerEntityId: user.customerId,
    documentCategory: 'tax_exemption_form',
    createdBy: user.id,
  })

  await writeAudit(event, {
    entityType: 'customer',
    entityId: user.customerId,
    action: 'portal.customer.document.tax_exemption.upload',
    afterData: { fileId: file.id, originalFilename: file.originalFilename },
    permissionKey: 'portal.read.own',
  })

  return { file }
})
