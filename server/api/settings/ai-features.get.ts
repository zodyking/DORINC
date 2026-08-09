import { useDb } from '../../db/client'
import { getAiProviderSettings } from '../../services/ai-provider.service'
import { requirePermission } from '../../utils/require-permission'

/**
 * Staff-readable AI feature flags (no keys/caps).
 * Powers UI gates such as the invoice wizard service log upload interstitial.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.create.all')
  const settings = await getAiProviderSettings(useDb())
  return {
    enabled: settings.enabled,
    serviceLogExtractionEnabled: settings.serviceLogExtractionEnabled,
    invoiceDescriptionEnabled: settings.invoiceDescriptionEnabled,
    platformHelpEnabled: settings.platformHelpEnabled,
  }
})
