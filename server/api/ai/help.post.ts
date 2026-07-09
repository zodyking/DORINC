import { askPlatformHelp } from '../../services/platform-help.service'
import { requirePermission } from '../../utils/require-permission'
import { rateLimitKeyFromUser, requireRateLimit } from '../../utils/require-rate-limit'
import { useDb } from '../../db/client'
import { validateBody } from '../../utils/validate'
import { platformHelpAskSchema } from '../../../shared/validators/ai'
import { writeAudit } from '../../services/audit.service'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'ai.help.all')
  await requireRateLimit(event, 'ai', rateLimitKeyFromUser(user.id))
  const body = await validateBody(event, platformHelpAskSchema)
  const db = useDb()

  const result = await askPlatformHelp(db, {
    question: body.question,
    pageContext: body.pageContext,
    userId: user.id,
  })

  await writeAudit(event, {
    entityType: 'ai_help',
    entityId: user.id,
    action: 'ai.help.query',
    afterData: {
      pageContext: body.pageContext ?? null,
      source: result.source,
      capped: result.capped,
    },
    permissionKey: 'ai.help.all',
    riskLevel: 'normal',
  })

  return result
})
