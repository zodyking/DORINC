import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { hasDatabaseConfigured, useDb } from '../../db/client'
import { getActiveSessionTermination } from '../../services/session-termination.service'
import { SESSION_TERMINATED_REDIRECT_SECONDS } from '../../../shared/session-termination'

/** Public: whether a recent admin mass-termination should route 401s to the notice page. */
export default defineEventHandler(async () => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) {
    return { active: false, redirectSeconds: SESSION_TERMINATED_REDIRECT_SECONDS, at: null as string | null }
  }

  const record = await getActiveSessionTermination(useDb())
  return {
    active: Boolean(record),
    at: record?.at ?? null,
    redirectSeconds: SESSION_TERMINATED_REDIRECT_SECONDS,
  }
})
