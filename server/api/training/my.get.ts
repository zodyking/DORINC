import { useDb } from '../../db/client'
import { listUserAssignments } from '../../services/training.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'training.complete.own')
  const db = useDb()
  const items = await listUserAssignments(db, actor.id)
  return { items }
})
