import { useDb } from '../../../../db/client'
import { writeAudit } from '../../../../services/audit.service'
import {
  AiFeaturesServiceError,
  reviewAiSuggestion,
} from '../../../../services/ai-features.service'
import { getAiSuggestion } from '../../../../services/ai-jobs.service'
import { apiError } from '../../../../utils/api-error'
import { hasPermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'
import { aiSuggestionReviewSchema } from '../../../../../shared/validators/ai'
import type { AuthContext } from '../../../../utils/require-permission'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const { id } = validateParams(event, idParamSchema)
  const review = await validateBody(event, aiSuggestionReviewSchema)
  const db = useDb()

  const before = await getAiSuggestion(db, id)
  if (!before) throw apiError(event, 'NOT_FOUND', 'Suggestion not found')

  const perm = before.featureType === 'service_log_extraction'
    ? 'ai.extract.all'
    : before.featureType === 'invoice_description'
      ? 'ai.describe.all'
      : 'ai.help.all'

  if (!hasPermission(event, perm)) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to review this suggestion')
  }

  if (before.featureType === 'invoice_description') {
    requirePermission(event, 'invoices.update.all')
  }
  if (before.featureType === 'service_log_extraction') {
    requirePermission(event, 'service_logs.review.all')
  }

  try {
    const suggestion = await reviewAiSuggestion(db, id, review, auth.user.id)

    const auditAction = review.action === 'reject'
      ? 'ai.suggestion.rejected'
      : review.action === 'edit'
        ? 'ai.suggestion.edited'
        : 'ai.suggestion.accepted'

    await writeAudit(event, {
      entityType: before.entityType,
      entityId: before.entityId,
      action: auditAction,
      beforeData: { suggestionId: id, status: before.status, suggestedContent: before.suggestedContent },
      afterData: {
        suggestionId: id,
        status: suggestion.status,
        action: review.action,
        appliedContent: review.content ?? suggestion.suggestedContent,
      },
      permissionKey: perm,
      riskLevel: 'sensitive',
    })

    return { suggestion }
  }
  catch (err) {
    if (err instanceof AiFeaturesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Suggestion not found')
      if (err.code === 'NOT_PENDING') throw apiError(event, 'CONFLICT', 'Suggestion was already reviewed')
      if (err.code === 'INVALID_CONTENT') throw apiError(event, 'VALIDATION_ERROR', err.message)
      if (err.code === 'LINE_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Line item not found')
    }
    throw err
  }
})
