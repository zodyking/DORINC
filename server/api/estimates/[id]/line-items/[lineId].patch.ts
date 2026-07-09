import { useDb } from '../../../../db/client'
import { EstimatesServiceError, updateEstimateLineItem } from '../../../../services/estimates.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requireEditSession } from '../../../../utils/require-edit-session'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { estimateLineParamSchema, estimateLineUpdateSchema } from '../../../../../shared/validators/estimates'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'estimates.manage.all')
  const { id, lineId } = validateParams(event, estimateLineParamSchema)
  const patch = await validateBody(event, estimateLineUpdateSchema)

  const db = useDb()
  await requireEditSession(event, db, 'estimate', id, actor.id)

  try {
    const { line, changedFields } = await updateEstimateLineItem(db, id, lineId, patch, actor.id)

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'estimate',
        entityId: id,
        action: 'estimates.line_items.update',
        afterData: { lineId: line.id, changedFields },
        changedFields,
        permissionKey: 'estimates.manage.all',
      })
    }

    return { line, changedFields }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Estimate not found')
      if (err.code === 'LINE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Line item not found')
      if (err.code === 'NOT_EDITABLE') throw apiError(event, 'CONFLICT', 'Only draft estimates can be edited')
      if (err.code === 'CATALOG_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Catalog item not found')
    }
    throw err
  }
})
