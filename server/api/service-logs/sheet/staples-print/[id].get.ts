import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import { hasPermission } from '../../../../utils/require-permission'
import type { AuthContext } from '../../../../utils/require-permission'
import {
  StaplesPrintMeServiceError,
  getStaplesPrintMeJob,
} from '../../../../services/staples-printme.service'

/** Poll Staples PrintMe job status (release code arrives via IMAP). */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const allowed = hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')

  if (!allowed) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this print job')
  }

  const id = getRouterParam(event, 'id')?.trim()
  if (!id) throw apiError(event, 'VALIDATION_ERROR', 'Missing print job id')

  try {
    const job = await getStaplesPrintMeJob(useDb(), id, auth.user.id, {
      allowAdminAll: hasPermission(event, 'service_logs.read.all')
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
