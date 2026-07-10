import { z } from 'zod'
import { useDb } from '../../../db/client'
import { saveLineTypeVerbs } from '../../../services/workspace-settings.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { lineTypeVerbsSchema } from '../../../../shared/validators/workspace-settings'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, z.object({ verbs: lineTypeVerbsSchema }))
  const verbs = await saveLineTypeVerbs(useDb(), body.verbs, auth.user.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.line_detection.update',
    permissionKey: 'system.admin.all',
  })

  return { verbs }
})
