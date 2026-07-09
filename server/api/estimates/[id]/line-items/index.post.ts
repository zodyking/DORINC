import { useDb } from '../../../../db/client'
import { addEstimateLineItem, EstimatesServiceError } from '../../../../services/estimates.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requireEditSession } from '../../../../utils/require-edit-session'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { estimateAddLineSchema } from '../../../../../shared/validators/estimates'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'estimates.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, estimateAddLineSchema)

  const db = useDb()
  await requireEditSession(event, db, 'estimate', id, actor.id)

  try {
    const line = await addEstimateLineItem(db, id, body, actor.id)

    await writeAudit(event, {
      entityType: 'estimate',
      entityId: id,
      action: 'estimates.line_items.create',
      afterData: {
        lineId: line.id,
        lineType: line.lineType,
        description: line.description,
        lineAmount: line.lineAmount,
      },
      permissionKey: 'estimates.manage.all',
    })

    return { line }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Estimate not found')
      if (err.code === 'NOT_EDITABLE') throw apiError(event, 'CONFLICT', 'Only draft estimates can be edited')
      if (err.code === 'CATALOG_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Catalog item not found')
    }
    throw err
  }
})
