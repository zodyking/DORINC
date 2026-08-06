import { useDb } from '../../../db/client'
import {
  AnnouncementsServiceError,
  createAnnouncement,
} from '../../../services/announcements.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { announcementUpsertSchema } from '../../../../shared/validators/announcements'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, announcementUpsertSchema)
  const db = useDb()

  try {
    const announcement = await createAnnouncement(db, body, actor.id)
    await writeAudit(event, {
      entityType: 'announcement',
      entityId: announcement.id,
      action: 'announcement.created',
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
      throw apiError(event, 'VALIDATION_ERROR', err.message)
    }
    throw err
  }
})
