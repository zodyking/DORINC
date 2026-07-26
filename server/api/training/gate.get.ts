import { useDb } from '../../db/client'
import { getTrainingGate } from '../../services/training.service'
import { requirePermission } from '../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'training.complete.own')
  const db = useDb()
  return getTrainingGate(db, actor.id)
})
