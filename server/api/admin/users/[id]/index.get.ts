import { desc, eq } from 'drizzle-orm'
import { useDb } from '../../../../db/client'
import { auditLogs } from '../../../../db/schema/audit'
import { getUserDetail, UsersServiceError } from '../../../../services/users.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'users.read.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const user = await getUserDetail(db, id)

    const activity = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(eq(auditLogs.actorUserId, id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(10)

    return { user, activity }
  }
  catch (err) {
    if (err instanceof UsersServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'User not found')
    }
    throw err
  }
})
