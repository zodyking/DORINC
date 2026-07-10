import { z } from 'zod'
import { useDb } from '../../../db/client'
import { saveInvoiceWorkspaceSettings } from '../../../services/workspace-settings.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { invoiceWorkspaceSettingsSchema } from '../../../../shared/validators/workspace-settings'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, z.object({ settings: invoiceWorkspaceSettingsSchema }))
  const settings = await saveInvoiceWorkspaceSettings(useDb(), body.settings, auth.user.id)

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.invoice.update',
    permissionKey: 'system.admin.all',
  })

  return { settings }
})
