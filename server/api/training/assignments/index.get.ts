import { useDb } from '../../../db/client'
import { listAllAssignments } from '../../../services/training.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'training.manage.all')
  const db = useDb()
  const query = getQuery(event)
  const items = await listAllAssignments(db, {
    userId: typeof query.userId === 'string' ? query.userId : undefined,
    moduleId: typeof query.moduleId === 'string' ? query.moduleId : undefined,
  })
  return { items }
})
