import { useDb } from '../../../db/client'
import {
  assignTrainingModule,
  TrainingServiceError,
} from '../../../services/training.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { trainingAssignSchema } from '../../../../shared/validators/training'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'training.manage.all')
  const db = useDb()
  const body = await validateBody(event, trainingAssignSchema)

  try {
    const row = await assignTrainingModule(db, {
      userId: body.userId,
      moduleId: body.moduleId,
      assignedBy: actor.id,
      locksAccess: body.locksAccess,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
      notes: body.notes ?? null,
    })

    await writeAudit(event, {
      entityType: 'training_assignment',
      entityId: row.id,
      action: 'training.assignment.create',
      afterData: {
        userId: row.userId,
        moduleId: row.moduleId,
        locksAccess: row.locksAccess,
      },
      permissionKey: 'training.manage.all',
    })

    return row
  }
  catch (err) {
    if (err instanceof TrainingServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'User or module not found')
      if (err.code === 'ALREADY_ASSIGNED') throw apiError(event, 'CONFLICT', 'Training already assigned and in progress')
      if (err.code === 'FORBIDDEN') throw apiError(event, 'FORBIDDEN', 'Cannot assign training to this user')
    }
    throw err
  }
})
