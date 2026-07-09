import { useDb } from '../../db/client'
import { isBootstrapped } from '../../services/setup.service'
import { saveSecurityConfig } from '../../services/app-config.service'
import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { setupSecuritySchema } from '../../../shared/validators/setup'

export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig()) {
    throw apiError(event, 'VALIDATION_ERROR', 'Configure the database in step 2 first')
  }

  const db = useDb()
  if (await isBootstrapped(db)) {
    throw apiError(event, 'CONFLICT', 'Setup is locked')
  }

  const body = await validateBody(event, setupSecuritySchema)

  try {
    await saveSecurityConfig(db, body)
    return { ok: true, message: 'Security settings saved' }
  }
  catch (err) {
    const msg = (err as Error).message
    if (msg.includes('locked by environment')) {
      throw apiError(event, 'CONFLICT', msg)
    }
    throw apiError(event, 'VALIDATION_ERROR', msg)
  }
})
