import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { useDb } from '../../db/client'
import { isBootstrapped } from '../../services/setup.service'
import { getSetupProgress, isAppUrlEnvLocked } from '../../services/app-config.service'

function envSnapshot() {
  const appUrl = process.env.APP_URL?.trim() || null
  return {
    appUrl,
    envLocked: {
      security: !!(process.env.ENCRYPTION_MASTER_KEY || process.env.SESSION_SECRET),
      appUrl: isAppUrlEnvLocked(),
      smtp: !!(process.env.SMTP_HOST && process.env.SMTP_FROM),
    },
  }
}

export default defineEventHandler(async (_event) => {
  const { appUrl, envLocked } = envSnapshot()

  if (!hasDatabaseConfig()) {
    return {
      needsBootstrap: true,
      progress: { database: false, smtp: false, security: false, ai: false },
      envLocked,
      env: { appUrl },
      databaseConfigured: false,
    }
  }

  const db = useDb()
  const bootstrapped = await isBootstrapped(db)
  const progress = await getSetupProgress(db)

  return {
    needsBootstrap: !bootstrapped,
    progress,
    envLocked,
    env: { appUrl },
    databaseConfigured: true,
  }
})
