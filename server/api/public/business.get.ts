import { useDb, hasDatabaseConfigured } from '../../db/client'
import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { getPublicBusinessProfile } from '../../services/workspace-settings.service'

/** Public business branding for unauthenticated screens (login, etc.). */
export default defineEventHandler(async () => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) {
    return { businessName: '' }
  }

  const profile = await getPublicBusinessProfile(useDb())
  return { businessName: profile.businessName }
})
