import { useDb, hasDatabaseConfigured } from '../../db/client'
import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { getPublicBusinessProfile, isCustomerPortalEnabled } from '../../services/workspace-settings.service'

/** Public business branding for unauthenticated screens (login, etc.). */
export default defineEventHandler(async () => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) {
    return { businessName: '', customerPortalEnabled: true }
  }

  const db = useDb()
  const [profile, customerPortalEnabled] = await Promise.all([
    getPublicBusinessProfile(db),
    isCustomerPortalEnabled(db),
  ])
  return { businessName: profile.businessName, customerPortalEnabled }
})
