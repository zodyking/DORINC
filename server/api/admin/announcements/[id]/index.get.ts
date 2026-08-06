import { useDb } from '../../../../db/client'
import {
  AnnouncementsServiceError,
  getAnnouncementAdmin,
} from '../../../../services/announcements.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()
  try {
    const announcement = await getAnnouncementAdmin(db, id)
    return { announcement }
  }
  catch (err) {
    if (err instanceof AnnouncementsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', err.message)
    }
    throw err
  }
})
