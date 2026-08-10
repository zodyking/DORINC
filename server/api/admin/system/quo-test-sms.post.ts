import { useDb } from '../../../db/client'
import { eq } from 'drizzle-orm'
import { users } from '../../../db/schema/auth'
import {
  getQuoConfig,
  isQuoSmsEnabled,
  refreshQuoConfigCache,
  sendQuoSms,
} from '../../../services/quo.service'
import { resolveSmsBody } from '../../../services/sms-templates.service'
import { resolveEmailBrand } from '../../../services/email-branding.service'
import { getAppUrl } from '../../../services/app-config.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { quoTestSmsSchema } from '../../../../shared/validators/quo'
import { normalizePhoneE164 } from '../../../../shared/format/phone-e164'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, quoTestSmsSchema)
  const db = useDb()
  await refreshQuoConfigCache(db)

  const config = await getQuoConfig(db)
  if (!isQuoSmsEnabled(config) && !(config.apiKey && config.fromNumber)) {
    throw apiError(event, 'VALIDATION_ERROR', 'Save a Quo API key and from number first')
  }

  let to = body.to ?? null
  if (!to) {
    const [row] = await db.select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, actor.id))
      .limit(1)
    to = normalizePhoneE164(row?.phone) 
  }
  if (!to) {
    throw apiError(event, 'VALIDATION_ERROR', 'Provide a destination phone number (or save one on your account)')
  }

  const brand = await resolveEmailBrand(db)
  const content = await resolveSmsBody(db, 'quo_test', {
    brandName: brand.brandName || 'DORINC',
    appUrl: brand.appUrl || getAppUrl(),
    name: actor.name,
    sentAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  })

  try {
    const result = await sendQuoSms({
      apiKey: config.apiKey,
      from: config.fromNumber,
      to,
      content,
    })
    await writeAudit(event, {
      entityType: 'app_settings',
      entityId: 'quo.config',
      action: 'quo.test_sms',
      afterData: { to, messageId: result.id },
      permissionKey: 'system.admin.all',
      riskLevel: 'sensitive',
    })
    return { ok: true, to, messageId: result.id, message: `Test SMS sent to ${to}` }
  }
  catch (err) {
    throw apiError(event, 'UPSTREAM_ERROR', err instanceof Error ? err.message : 'Quo SMS send failed')
  }
})
