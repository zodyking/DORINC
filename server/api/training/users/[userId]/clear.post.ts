import { useDb } from '../../../../db/client'
import {
  clearUserTrainingAssignments,
  clearUserTrainingLocks,
} from '../../../../services/training.service'
import { writeAudit } from '../../../../services/audit.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { z } from 'zod'

const userIdParamSchema = z.object({
  userId: z.string().uuid(),
})

/**
 * Clear training for a user.
 * - mode=all (default): delete every assignment (and cascaded progress)
 * - mode=locks: keep courses, turn off login locks only
 */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'training.manage.all')
  const { userId } = validateParams(event, userIdParamSchema)
  const query = getQuery(event)
  const mode = query.mode === 'locks' ? 'locks' : 'all'
  const db = useDb()

  if (mode === 'locks') {
    const rows = await clearUserTrainingLocks(db, userId)
    await writeAudit(event, {
      entityType: 'user',
      entityId: userId,
      action: 'training.locks.clear',
      afterData: { cleared: rows.length, actorId: actor.id },
      permissionKey: 'training.manage.all',
    })
    return { ok: true, mode, cleared: rows.length }
  }

  const rows = await clearUserTrainingAssignments(db, userId)
  await writeAudit(event, {
    entityType: 'user',
    entityId: userId,
    action: 'training.assignments.clear',
    afterData: { cleared: rows.length, actorId: actor.id },
    permissionKey: 'training.manage.all',
  })
  return { ok: true, mode, cleared: rows.length }
})
