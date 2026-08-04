import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  AiFeaturesServiceError,
  executeInvoiceLineAudit,
} from '../../../services/ai-features.service'
import { AiProviderServiceError } from '../../../services/ai-provider.service'
import { OpenRouterServiceError } from '../../../services/ai-openrouter.service'
import { InvoicesServiceError } from '../../../services/invoices.service'
import { apiError } from '../../../utils/api-error'
import { rateLimitKeyFromUser, requireRateLimit } from '../../../utils/require-rate-limit'
import { requireEditSession } from '../../../utils/require-edit-session'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'ai.describe.all')
  requirePermission(event, 'invoices.update.all')
  await requireRateLimit(event, 'ai', rateLimitKeyFromUser(actor.id))

  const { id } = validateParams(event, idParamSchema)
  const db = useDb()
  await requireEditSession(event, db, 'invoice', id, actor.id)

  try {
    const { aiJob, auditContent, suggestion } = await executeInvoiceLineAudit(db, id, actor.id)

    try {
      await writeAudit(event, {
        entityType: 'invoice',
        entityId: id,
        action: 'ai.line_audit.completed',
        afterData: {
          aiJobId: aiJob.id,
          issuesFound: auditContent.summary.issuesFound,
          suggestionId: suggestion?.id ?? null,
        },
        permissionKey: 'ai.describe.all',
      })
    }
    catch (auditErr) {
      console.error('[ai-line-audit] audit write failed:', (auditErr as Error).message)
    }

    return {
      aiJob,
      issuesFound: auditContent.summary.issuesFound,
      auditContent,
      suggestion,
    }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Invoice not found')
      if (err.code === 'NOT_EDITABLE') throw apiError(event, 'CONFLICT', 'Paid and void invoices cannot be edited')
    }
    if (err instanceof AiFeaturesServiceError) {
      if (err.code === 'NOT_CONFIGURED') throw apiError(event, 'CONFLICT', 'AI is not configured')
      if (err.code === 'FEATURE_DISABLED') throw apiError(event, 'CONFLICT', err.message)
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      if (err.code === 'AI_FAILED') throw apiError(event, 'CONFLICT', err.message)
      if (err.code === 'SPEND_CAP_EXCEEDED') throw apiError(event, 'CONFLICT', err.message)
    }
    if (err instanceof AiProviderServiceError && (err.code === 'NOT_CONFIGURED' || err.code === 'KEY_MISSING')) {
      throw apiError(event, 'CONFLICT', 'AI is not configured')
    }
    if (err instanceof OpenRouterServiceError) {
      const msg = err.message.toLowerCase()
      if (msg.includes('authentication') || msg.includes('api key') || msg.includes('unauthorized')) {
        throw apiError(event, 'CONFLICT', 'AI is not configured')
      }
      throw apiError(event, 'CONFLICT', err.message)
    }
    throw err
  }
})
