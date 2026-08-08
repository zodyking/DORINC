import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { hasPermission } from '../../../../utils/require-permission'
import type { AuthContext } from '../../../../utils/require-permission'
import { canViewStaplesPrint } from '../../../../utils/staples-print-access'
import {
  StaplesPrintMeServiceError,
  dismissStaplesPrintMeJob,
} from '../../../../services/staples-printme.service'

/** Soft-remove an active Staples PrintMe order from the Staples page. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  if (!canViewStaplesPrint(event)) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to remove this print job')
  }

  const id = getRouterParam(event, 'id')?.trim()
  if (!id) throw apiError(event, 'VALIDATION_ERROR', 'Missing print job id')

  try {
    const job = await dismissStaplesPrintMeJob(useDb(), id, auth.user.id, {
      allowAdminAll: hasPermission(event, 'staples.read.all')
        || hasPermission(event, 'service_logs.read.all')
        || hasPermission(event, 'system.admin.all'),
    })
    return { job }
  }
  catch (err) {
    if (err instanceof StaplesPrintMeServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      if (err.code === 'FORBIDDEN') throw apiError(event, 'FORBIDDEN', err.message)
      throw apiError(event, 'INTERNAL_ERROR', err.message)
    }
    throw err
  }
})
