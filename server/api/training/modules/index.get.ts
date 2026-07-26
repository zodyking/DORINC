import { useDb } from '../../../db/client'
import { listTrainingModules } from '../../../services/training.service'
import { hasPermission, requirePermission } from '../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'training.complete.own')
  const db = useDb()
  const canManage = hasPermission(event, 'training.manage.all')
  const items = await listTrainingModules(db, { includeUnpublished: canManage })
  return { items }
})
