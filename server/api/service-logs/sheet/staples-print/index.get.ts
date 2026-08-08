import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { hasPermission } from '../../../../utils/require-permission'
import type { AuthContext } from '../../../../utils/require-permission'
import { canViewStaplesPrint } from '../../../../utils/staples-print-access'
import { listActiveStaplesPrintMeJobs } from '../../../../services/staples-printme.service'

/** List active Staples PrintMe orders (nudges IMAP while awaiting). */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  if (!canViewStaplesPrint(event)) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to view Staples print jobs')
  }

  const jobs = await listActiveStaplesPrintMeJobs(useDb(), auth.user.id, {
    nudgeImap: true,
    // Anyone with the Staples page permission sees shop-wide active codes.
    allUsers: hasPermission(event, 'staples.read.all')
      || hasPermission(event, 'service_logs.read.all')
      || hasPermission(event, 'system.admin.all'),
  })
  return { jobs }
})
