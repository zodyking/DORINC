import { useDb } from '../../db/client'
import { getDetectionSettings } from '../../services/workspace-settings.service'
import { requirePermission } from '../../utils/require-permission'

/** Staff read — powers client-side line/catalog auto-detection. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.read.all')
  return getDetectionSettings(useDb())
})
