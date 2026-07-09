import { useDb } from '../../db/client'
import { isBootstrapped } from '../../services/setup.service'
import { saveSmtpConfig } from '../../services/app-config.service'
import { resetMailTransport } from '../../mail/mailer'
import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { setupSmtpSchema } from '../../../shared/validators/setup'

export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig()) {
    throw apiError(event, 'VALIDATION_ERROR', 'Configure the database in step 2 first')
  }

  const db = useDb()
  if (await isBootstrapped(db)) {
    throw apiError(event, 'CONFLICT', 'Setup is locked')
  }

  const body = await validateBody(event, setupSmtpSchema)

  try {
    await saveSmtpConfig(db, {
      host: body.host,
      port: body.port,
      user: body.username,
      pass: body.password,
      from: body.from,
    })
    resetMailTransport()
    return { ok: true, message: 'SMTP settings saved' }
  }
  catch (err) {
    const msg = (err as Error).message
    if (msg.includes('locked by environment')) {
      throw apiError(event, 'CONFLICT', msg)
    }
    if (msg.includes('master key')) {
      throw apiError(event, 'VALIDATION_ERROR', 'Complete the Security step before configuring SMTP')
    }
    throw apiError(event, 'VALIDATION_ERROR', msg)
  }
})
