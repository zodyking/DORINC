import { and, desc, eq } from 'drizzle-orm'
import { useDb } from '../../../db/client'
import { auditLogs } from '../../../db/schema/audit'
import { getEstimateDetail, EstimatesServiceError } from '../../../services/estimates.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'estimates.read.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const estimate = await getEstimateDetail(db, id)

    const history = await db.select({
      id: auditLogs.id,
      action: auditLogs.action,
      actorName: auditLogs.actorName,
      changedFields: auditLogs.changedFields,
      afterData: auditLogs.afterData,
      createdAt: auditLogs.createdAt,
    })
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'estimate'), eq(auditLogs.entityId, id)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(25)

    return { estimate, history }
  }
  catch (err) {
    if (err instanceof EstimatesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Estimate not found')
    }
    throw err
  }
})
