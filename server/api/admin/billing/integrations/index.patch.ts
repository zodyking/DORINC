import { useDb } from '../../../../db/client'
import {
  getBillingIntegrations,
  updateBillingIntegrations,
} from '../../../../services/billing-integrations.service'
import { writeAudit } from '../../../../services/audit.service'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody } from '../../../../utils/validate'
import { billingIntegrationsPatchSchema } from '../../../../../shared/validators/billing-integrations'
import { apiError } from '../../../../utils/api-error'

export default defineEventHandler(async (event) => {
  const user = requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, billingIntegrationsPatchSchema)
  const db = useDb()
  const before = await getBillingIntegrations(db)

  try {
    const settings = await updateBillingIntegrations(db, body, user.id)

    void writeAudit(event, {
      entityType: 'billing_integrations',
      entityId: settings.id,
      action: 'billing.integrations.updated',
      beforeData: {
        vultrEnabled: before.vultrEnabled,
        hasVultrApiKey: before.hasVultrApiKey,
        vultrMonitoredInstanceIds: before.vultrMonitoredInstanceIds,
        domainRenewals: before.domainRenewals,
        openrouterBillingEnabled: before.openrouterBillingEnabled,
        hasOpenrouterManagementKey: before.hasOpenrouterManagementKey,
      },
      afterData: {
        vultrEnabled: settings.vultrEnabled,
        hasVultrApiKey: settings.hasVultrApiKey,
        vultrMonitoredInstanceIds: settings.vultrMonitoredInstanceIds,
        domainRenewals: settings.domainRenewals,
        openrouterBillingEnabled: settings.openrouterBillingEnabled,
        hasOpenrouterManagementKey: settings.hasOpenrouterManagementKey,
      },
      permissionKey: 'system.admin.all',
      riskLevel: 'sensitive',
    }).catch((err) => {
      console.error('[billing-integrations] audit write failed', err)
    })

    return { settings }
  }
  catch (err) {
    const msg = (err as Error).message ?? 'Failed to save billing integrations'
    if (msg.includes('ENCRYPTION_MASTER_KEY')) {
      throw apiError(
        event,
        'SERVICE_UNAVAILABLE',
        'Encryption is not configured. Complete Security setup in the Server Setup Wizard first.',
      )
    }
    throw apiError(event, 'INTERNAL_ERROR', msg)
  }
})
