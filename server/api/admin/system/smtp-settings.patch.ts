import { formatSmtpFromHeader } from '../../../shared/format/smtp-from'
import { useDb } from '../../../db/client'
import { getSmtpConfig, saveSmtpConfig } from '../../../services/app-config.service'
import { resetMailTransport } from '../../../mail/mailer'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { smtpSettingsSchema } from '../../../../shared/validators/system-admin'

export default defineEventHandler(async (event) => {
  const auth = event.context.auth as { user: { id: string } }
  requirePermission(event, 'system.admin.all')
  const body = await validateBody(event, smtpSettingsSchema)
  const db = useDb()

  const existing = getSmtpConfig()
  const from = formatSmtpFromHeader(body.fromName, body.fromAddress)

  try {
    await saveSmtpConfig(db, {
      host: body.host,
      port: body.port,
      user: body.username,
      pass: body.password ?? existing?.pass ?? '',
      from,
    }, auth.user.id)
    resetMailTransport()

    await writeAudit(event, {
      entityType: 'system',
      action: 'settings.smtp.update',
      afterData: { host: body.host, port: body.port, from },
      permissionKey: 'system.admin.all',
      riskLevel: 'high',
    })

    return { ok: true, message: 'SMTP settings updated' }
  }
  catch (err) {
    const msg = (err as Error).message
    if (msg.includes('locked by environment')) {
      throw apiError(event, 'CONFLICT', 'SMTP is locked by environment variables on this server')
    }
    throw apiError(event, 'VALIDATION_ERROR', msg)
  }
})
