import { useDb } from '../../../db/client'
import { listAiSuggestionsForEntity } from '../../../services/ai-jobs.service'
import { getInvoice, InvoicesServiceError } from '../../../services/invoices.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams, validateQuery } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { z } from 'zod'

const querySchema = z.object({
  lineItemId: z.string().uuid().optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.read.all')
  const { id } = validateParams(event, idParamSchema)
  const { lineItemId } = validateQuery(event, querySchema)
  const db = useDb()

  try {
    await getInvoice(db, id)
    let suggestions = await listAiSuggestionsForEntity(db, 'invoice', id, {
      featureType: 'invoice_description',
    })

    if (lineItemId) {
      suggestions = suggestions.filter((s) => {
        const orig = s.originalContent?.lineItemId ?? s.suggestedContent.lineItemId
        return orig === lineItemId
      })
    }

    return { suggestions }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }
})
