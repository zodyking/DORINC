import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { useDb } from '../../db/client'
import { isBootstrapped } from '../../services/setup.service'
import { getSetupProgress } from '../../services/app-config.service'

export default defineEventHandler(async (_event) => {
  if (!hasDatabaseConfig()) {
    return {
      needsBootstrap: true,
      progress: { database: false, smtp: false, security: false, ai: false },
      envLocked: { security: false, smtp: false },
      databaseConfigured: false,
    }
  }

  const db = useDb()
  const bootstrapped = await isBootstrapped(db)
  const progress = await getSetupProgress(db)

  return {
    needsBootstrap: !bootstrapped,
    progress,
    envLocked: {
      security: !!(process.env.ENCRYPTION_MASTER_KEY || process.env.SESSION_SECRET),
      smtp: !!(process.env.SMTP_HOST && process.env.SMTP_FROM),
    },
    databaseConfigured: true,
  }
})
