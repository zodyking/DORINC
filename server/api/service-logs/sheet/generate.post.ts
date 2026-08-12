import { useDb } from '../../../db/client'
import {
  generateServiceLogSheetProposal,
  SheetGenerateServiceError,
} from '../../../services/service-log-sheet-generate.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'

/**
 * Multi-step propose a demand-ranked service log sheet (review before save).
 * Permission mirrors sheet edit: catalog.manage.all.
 */
export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'catalog.manage.all')

  try {
    return await generateServiceLogSheetProposal(useDb(), actor.id)
  }
  catch (err) {
    if (err instanceof SheetGenerateServiceError) {
      if (err.code === 'NO_CANDIDATES') throw apiError(event, 'VALIDATION_ERROR', err.message)
      if (err.code === 'SPEND_CAP_EXCEEDED') throw apiError(event, 'RATE_LIMITED', err.message)
      if (err.code === 'NOT_CONFIGURED' || err.code === 'FEATURE_DISABLED') {
        throw apiError(event, 'SERVICE_UNAVAILABLE', err.message)
      }
      throw apiError(event, 'UPSTREAM_ERROR', err.message)
    }
    throw err
  }
})
