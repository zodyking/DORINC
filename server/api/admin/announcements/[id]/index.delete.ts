import { useDb } from '../../../../db/client'
import {
  AnnouncementsServiceError,
  deleteAnnouncement,
} from '../../../../services/announcements.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    await deleteAnnouncement(db, id)
    await writeAudit(event, {
      entityType: 'announcement',
      entityId: id,
      action: 'announcement.deleted',
      permissionKey: 'system.admin.all',
    })
    return { ok: true }
  }
  catch (err) {
    if (err instanceof AnnouncementsServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', err.message)
    }
    throw err
  }
})
