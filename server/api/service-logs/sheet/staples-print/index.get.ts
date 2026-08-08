import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { hasPermission } from '../../../../utils/require-permission'
import type { AuthContext } from '../../../../utils/require-permission'
import { listActiveStaplesPrintMeJobs } from '../../../../services/staples-printme.service'

/** List active Staples PrintMe orders for the current user (nudges IMAP while awaiting). */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const allowed = hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')

  if (!allowed) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to view Staples print jobs')
  }

  const jobs = await listActiveStaplesPrintMeJobs(useDb(), auth.user.id, { nudgeImap: true })
  return { jobs }
})
