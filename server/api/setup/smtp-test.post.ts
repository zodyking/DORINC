import { useDb } from '../../db/client'
import { isBootstrapped } from '../../services/setup.service'
import { saveSmtpConfig } from '../../services/app-config.service'
import { resetMailTransport } from '../../mail/mailer'
import { sendBrandedMail } from '../../mail/branded-mail'
import { buildSmtpTestEmail } from '../../mail/templates/system'
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

    const { resolveEmailBrand } = await import('../../services/email-branding.service')
    const brand = await resolveEmailBrand(db)
    const mail = buildSmtpTestEmail({
      brandName: brand.brandName || BRAND_NAME,
      source: 'setup wizard',
      appUrl: brand.appUrl,
      brand,
    })
    const result = await sendBrandedMail(db, { to: body.to, ...mail }, brand)

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
