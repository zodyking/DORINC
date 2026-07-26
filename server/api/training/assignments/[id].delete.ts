import { useDb } from '../../../db/client'
import {
  unassignTrainingModule,
  TrainingServiceError,
} from '../../../services/training.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'training.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const row = await unassignTrainingModule(db, id)
    await writeAudit(event, {
      entityType: 'training_assignment',
      entityId: row.id,
      action: 'training.assignment.remove',
      beforeData: { userId: row.userId, moduleId: row.moduleId },
      permissionKey: 'training.manage.all',
    })
    return { ok: true }
  }
  catch (err) {
    if (err instanceof TrainingServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Assignment not found')
    }
    throw err
  }
})
