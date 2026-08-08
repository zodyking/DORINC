import { useDb } from '../../../../db/client'
import { apiError } from '../../../../utils/api-error'
import type { AuthContext } from '../../../../utils/require-permission'
import { canStartStaplesPrint } from '../../../../utils/staples-print-access'
import {
  StaplesPrintMeServiceError,
  startStaplesPrintMeJob,
} from '../../../../services/staples-printme.service'

/** Email the blank service log sheet to Staples PrintMe; release code lands on the Staples page. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  if (!canStartStaplesPrint(event)) {
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
