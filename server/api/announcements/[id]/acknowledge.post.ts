import type { AuthContext } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'
import {
  acknowledgeAnnouncement,
  AnnouncementsServiceError,
} from '../../../services/announcements.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')
  if (auth.user.accountType === 'customer') {
    throw apiError(event, 'FORBIDDEN', 'Announcements are for staff accounts')
  }

  const { id } = validateParams(event, idParamSchema)
  const db = useDb()

  try {
    const gate = await acknowledgeAnnouncement(db, id, auth.user.id, auth.user.accountType)
    try {
      await writeAudit(event, {
        entityType: 'announcement',
        entityId: id,
        action: 'announcement.acknowledged',
        afterData: { pendingCount: gate.pendingCount },
      })
    }
    catch (auditErr) {
      console.error('[announcements] ack audit failed:', (auditErr as Error).message)
    }
    return { gate }
  }
  catch (err) {
    if (err instanceof AnnouncementsServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      throw apiError(event, 'VALIDATION_ERROR', err.message)
    }
    throw err
  }
})
