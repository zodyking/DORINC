import { formatSmtpFromHeader, parseSmtpFromHeader } from '../../../../shared/format/smtp-from'
import { getSmtpConfig, isSmtpEnvLocked, refreshAppConfigCache } from '../../../services/app-config.service'
import { requirePermission } from '../../../utils/require-permission'
import { useDb } from '../../../db/client'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  await refreshAppConfigCache(useDb())
  const config = getSmtpConfig()
  const parsed = parseSmtpFromHeader(config?.from ?? '')
  return {
    configured: !!(config?.host && config?.from),
    hasPassword: !!(config?.host && config?.pass),
    host: config?.host ?? '',
    port: config?.port ?? 587,
    username: config?.user ?? '',
    fromName: parsed.fromName,
    fromAddress: parsed.fromAddress,
    from: config?.from ?? '',
    envLocked: isSmtpEnvLocked(),
  }
})
