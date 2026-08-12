import { useDb } from '../../../db/client'
import {
  setTrainingAssignmentLock,
  TrainingServiceError,
} from '../../../services/training.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody, validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { z } from 'zod'

const bodySchema = z.object({
  locksAccess: z.boolean(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'training.manage.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, bodySchema)
  const db = useDb()

  try {
    const row = await setTrainingAssignmentLock(db, id, body.locksAccess)
    await writeAudit(event, {
      entityType: 'training_assignment',
      entityId: row.id,
      action: body.locksAccess ? 'training.assignment.lock' : 'training.assignment.unlock',
      afterData: { userId: row.userId, moduleId: row.moduleId, locksAccess: row.locksAccess },
      permissionKey: 'training.manage.all',
    })
    return { assignment: row }
  }
  catch (err) {
    if (err instanceof TrainingServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Assignment not found')
    }
    throw err
  }
})
