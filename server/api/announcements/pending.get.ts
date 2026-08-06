import type { AuthContext } from '../../utils/require-permission'
import { useDb } from '../../db/client'
import { getPendingAnnouncementViews } from '../../services/announcements.service'
import { apiError } from '../../utils/api-error'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Not signed in')
  if (auth.user.accountType === 'customer') {
    return { items: [] }
  }

  const db = useDb()
  const items = await getPendingAnnouncementViews(db, auth.user.id, auth.user.accountType)
  return { items }
})
