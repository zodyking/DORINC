import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { trainingLessonProgress } from '../../../db/schema/training'
import {
  getTrainingModuleDetail,
  listUserAssignments,
  TrainingServiceError,
} from '../../../services/training.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'

const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(120),
})

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'training.complete.own')
  const { slug } = validateParams(event, slugParamSchema)
  const db = useDb()

  try {
    const { module, lessons } = await getTrainingModuleDetail(db, slug)
    const assignments = await listUserAssignments(db, actor.id)
    const assignment = assignments.find(a => a.moduleId === module.id) ?? null

    const progress = assignment
      ? await db.select().from(trainingLessonProgress)
          .where(eq(trainingLessonProgress.assignmentId, assignment.id))
      : []

    return {
      module,
      lessons,
      assignment,
      progress,
    }
  }
  catch (err) {
    if (err instanceof TrainingServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Training module not found')
    }
    throw err
  }
})
