import { getSmtpConfig } from '../../../services/app-config.service'
import { requirePermission } from '../../../utils/require-permission'

export default defineEventHandler((event) => {
  requirePermission(event, 'system.admin.all')
  const config = getSmtpConfig()
  return {
    configured: !!(config?.host && config?.from),
    host: config?.host ?? '',
    port: config?.port ?? 587,
    username: config?.user ?? '',
    from: config?.from ?? '',
    envLocked: !!(process.env.SMTP_HOST && process.env.SMTP_FROM),
  }
})
