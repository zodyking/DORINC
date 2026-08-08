import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { hasPermission } from '../../../utils/require-permission'
import type { AuthContext } from '../../../utils/require-permission'
import {
  StaplesPrintMeServiceError,
  startStaplesPrintMeJob,
} from '../../../services/staples-printme.service'

/** Email the blank service log sheet to Staples PrintMe and start waiting for the release code. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const allowed = hasPermission(event, 'service_logs.read.all')
    || hasPermission(event, 'service_logs.read.own')
    || hasPermission(event, 'service_logs.upload.own')

  if (!allowed) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to print the service log sheet')
  }

  try {
    const job = await startStaplesPrintMeJob(useDb(), auth.user.id)
    return { job }
  }
  catch (err) {
    if (err instanceof StaplesPrintMeServiceError) {
      if (err.code === 'SMTP_NOT_CONFIGURED') throw apiError(event, 'VALIDATION_ERROR', err.message)
      if (err.code === 'PDF_FAILED') throw apiError(event, 'INTERNAL_ERROR', err.message)
      throw apiError(event, 'INTERNAL_ERROR', err.message)
    }
    throw err
  }
})
