import { z } from 'zod'
import { useDb } from '../../../db/client'
import { saveInvoiceWorkspaceSettings } from '../../../services/workspace-settings.service'
import { revokeActiveCustomerPortalSessions } from '../../../services/portal-access.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { invoiceWorkspaceSettingsSchema } from '../../../../shared/validators/workspace-settings'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, z.object({ settings: invoiceWorkspaceSettingsSchema }))
  const db = useDb()
  const settings = await saveInvoiceWorkspaceSettings(db, body.settings, auth.user.id)

  let revokedPortalSessions = 0
  if (!settings.customerPortalEnabled) {
    revokedPortalSessions = await revokeActiveCustomerPortalSessions(db)
  }

  await writeAudit(event, {
    entityType: 'system',
    action: 'settings.invoice.update',
    permissionKey: 'system.admin.all',
    afterData: {
      customerPortalEnabled: settings.customerPortalEnabled,
      revokedPortalSessions,
    },
  })

  return { settings }
})
