import { useDb } from '../../../../db/client'
import {
  AnnouncementsServiceError,
  updateAnnouncement,
} from '../../../../services/announcements.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { announcementPatchSchema } from '../../../../../shared/validators/announcements'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { id } = validateParams(event, idParamSchema)
  const body = await validateBody(event, announcementPatchSchema)
  const db = useDb()

  try {
    const announcement = await updateAnnouncement(db, id, body)
    await writeAudit(event, {
      entityType: 'announcement',
      entityId: id,
      action: 'announcement.updated',
      afterData: {
        title: announcement.title,
        isActive: announcement.isActive,
        audienceMode: announcement.audienceMode,
      },
      permissionKey: 'system.admin.all',
    })
    return { announcement }
  }
  catch (err) {
    if (err instanceof AnnouncementsServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      throw apiError(event, 'VALIDATION_ERROR', err.message)
    }
    throw err
  }
})
