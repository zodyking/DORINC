import { useDb } from '../../db/client'
import { isBootstrapped } from '../../services/setup.service'
import { saveSmtpConfig } from '../../services/app-config.service'
import { sendMail, resetMailTransport } from '../../mail/mailer'
import { hasDatabaseConfig } from '../../services/runtime-config.service'
import { apiError } from '../../utils/api-error'
import { validateBody } from '../../utils/validate'
import { setupSmtpTestSchema } from '../../../shared/validators/setup'
import { BRAND_NAME } from '../../../shared/brand'

export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig()) {
    throw apiError(event, 'VALIDATION_ERROR', 'Configure the database in step 2 first')
  }

  const db = useDb()
  if (await isBootstrapped(db)) {
    throw apiError(event, 'CONFLICT', 'Setup is locked')
  }

  const body = await validateBody(event, setupSmtpTestSchema)

  try {
    await saveSmtpConfig(db, {
      host: body.host,
      port: body.port,
      user: body.username,
      pass: body.password,
      from: body.from,
    })
    resetMailTransport()

    const result = await sendMail({
      to: body.to,
      subject: `${BRAND_NAME} setup — SMTP test`,
      text: [
        `This is a test message from the ${BRAND_NAME} setup wizard.`,
        '',
        'If you received this, SMTP is configured correctly.',
      ].join('\n'),
    })

    return {
      ok: true,
      delivered: result.delivered,
      message: result.delivered
        ? `Test email sent to ${body.to}`
        : `SMTP saved — test logged in development (target: ${body.to})`,
    }
  }
  catch (err) {
    throw apiError(event, 'VALIDATION_ERROR', (err as Error).message)
  }
})
