import { formatSmtpFromHeader, parseSmtpFromHeader } from '../../../../shared/format/smtp-from'
import { getSmtpConfig } from '../../../services/app-config.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler((event) => {
  requirePermission(event, 'system.admin.all')
  const config = getSmtpConfig()
  const parsed = parseSmtpFromHeader(config?.from ?? '')
  return {
    configured: !!(config?.host && config?.from),
    host: config?.host ?? '',
    port: config?.port ?? 587,
    username: config?.user ?? '',
    fromName: parsed.fromName,
    fromAddress: parsed.fromAddress,
    from: config?.from ?? '',
    envLocked: !!(process.env.SMTP_HOST && process.env.SMTP_FROM),
  }
})
