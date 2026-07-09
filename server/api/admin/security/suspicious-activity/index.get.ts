import {
  listSuspiciousActivityAlerts,
  scanSuspiciousActivity,
} from '../../../../services/suspicious-activity.service'
import { useDb } from '../../../../db/client'
import { requirePermission } from '../../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const db = useDb()

  await scanSuspiciousActivity(db)

  const query = getQuery(event)
  const status = query.status === 'dismissed' ? 'dismissed' : query.status === 'open' ? 'open' : undefined
  const items = await listSuspiciousActivityAlerts(db, { status, limit: 50 })

  return {
    items: items.map(item => ({
      id: item.id,
      ruleKey: item.ruleKey,
      severity: item.severity,
      title: item.title,
      description: item.description,
      metadata: item.metadata,
      actorUserId: item.actorUserId,
      ipAddress: item.ipAddress,
      status: item.status,
      dismissedAt: item.dismissedAt,
      dismissedBy: item.dismissedBy,
      createdAt: item.createdAt,
    })),
  }
})
