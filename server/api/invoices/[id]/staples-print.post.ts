import { useDb } from '../../../db/client'
import { apiError } from '../../../utils/api-error'
import { hasPermission, type AuthContext } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import {
  StaplesPrintMeServiceError,
  startStaplesPrintMeJob,
} from '../../../services/staples-printme.service'

/** Email this invoice's PDF to Staples PrintMe; release code lands on the Staples page. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const canPrint = hasPermission(event, 'staples.print.all')
    || hasPermission(event, 'invoices.read.all')
    || hasPermission(event, 'invoices.update.all')
  if (!canPrint) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to print invoices via Staples')
  }

  const { id } = validateParams(event, idParamSchema)

  try {
    const job = await startStaplesPrintMeJob(useDb(), auth.user.id, {
      documentType: 'invoice',
      entityId: id,
    })
    return { job }
  }
  catch (err) {
    if (err instanceof StaplesPrintMeServiceError) {
      if (err.code === 'SMTP_NOT_CONFIGURED') throw apiError(event, 'VALIDATION_ERROR', err.message)
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      if (err.code === 'PDF_FAILED') throw apiError(event, 'INTERNAL_ERROR', err.message)
      throw apiError(event, 'INTERNAL_ERROR', err.message)
    }
    throw err
  }
})
