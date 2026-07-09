import { useDb } from '../../../db/client'
import { EstimatesServiceError, updateEstimateDraft } from '../../../services/estimates.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requireEditSession } from '../../../utils/require-edit-session'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { estimateUpdateSchema } from '../../../../shared/validators/estimates'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'estimates.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const patch = await validateBody(event, estimateUpdateSchema)

  const db = useDb()
  await requireEditSession(event, db, 'estimate', id, actor.id)

  try {
    const { estimate, before, changedFields } = await updateEstimateDraft(db, id, patch, actor.id)

    if (changedFields.length) {
      await writeAudit(event, {
        entityType: 'estimate',
        entityId: id,
        action: 'estimates.update',
        beforeData: Object.fromEntries(changedFields.map(f => [f, before[f as keyof typeof before]])),
        afterData: Object.fromEntries(changedFields.map(f => [f, estimate[f as keyof typeof estimate]])),
        changedFields,
        permissionKey: 'estimates.manage.all',
      })
    }

    return { estimate, changedFields }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Estimate not found')
      if (err.code === 'NOT_EDITABLE') {
        throw apiError(event, 'CONFLICT', 'Only draft estimates can be edited')
      }
      if (err.code === 'VEHICLE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Vehicle not found')
    }
    throw err
  }
})
