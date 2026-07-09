import { useDb } from '../../../../db/client'
import { deleteEstimateLineItem, EstimatesServiceError } from '../../../../services/estimates.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requireEditSession } from '../../../../utils/require-edit-session'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { estimateLineParamSchema } from '../../../../../shared/validators/estimates'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'estimates.manage.all')
  const { id, lineId } = validateParams(event, estimateLineParamSchema)

  const db = useDb()
  await requireEditSession(event, db, 'estimate', id, actor.id)

  try {
    await deleteEstimateLineItem(db, id, lineId, actor.id)

    await writeAudit(event, {
      entityType: 'estimate',
      entityId: id,
      action: 'estimates.line_items.delete',
      afterData: { lineId },
      permissionKey: 'estimates.manage.all',
    })

    return { ok: true }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Estimate not found')
      if (err.code === 'LINE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Line item not found')
      if (err.code === 'NOT_EDITABLE') throw apiError(event, 'CONFLICT', 'Only draft estimates can be edited')
    }
    throw err
  }
})
