import { useDb } from '../../db/client'
import {
  saveLessonProgress,
  TrainingServiceError,
} from '../../services/training.service'
import { apiError } from '../../utils/api-error'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { trainingProgressSchema } from '../../../shared/validators/training'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'training.complete.own')
  const body = await validateBody(event, trainingProgressSchema)
  const db = useDb()

  try {
    return await saveLessonProgress(db, {
      userId: actor.id,
      assignmentId: body.assignmentId,
      lessonId: body.lessonId,
      stepIndex: body.stepIndex,
      completed: body.completed,
    })
  }
  catch (err) {
    if (err instanceof TrainingServiceError) {
      if (err.code === 'NOT_ASSIGNED') throw apiError(event, 'FORBIDDEN', 'Training not assigned to you')
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Lesson not found')
    }
    throw err
  }
})
