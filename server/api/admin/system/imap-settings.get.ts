import { useDb } from '../../../db/client'
import { getImapConfig, getImapFilters, isImapEnvLocked } from '../../../services/imap-config.service'
import { requirePermission } from '../../../utils/require-permission'
import { parseSmtpFromHeader } from '../../../../shared/format/smtp-from'
import { getSmtpConfig } from '../../../services/app-config.service'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const config = getImapConfig()
  const filters = getImapFilters()
  const smtp = getSmtpConfig()
  const smtpFrom = smtp?.from ? parseSmtpFromHeader(smtp.from) : { fromName: '', fromAddress: '' }

  return {
    configured: !!config,
    host: config?.host ?? '',
    port: config?.port ?? 993,
    username: config?.user ?? '',
    mailbox: config?.mailbox ?? 'INBOX',
    useTls: config?.useTls ?? true,
    envLocked: isImapEnvLocked(),
    filters: {
      companyEmail: filters.companyEmail || smtpFrom.fromAddress,
      additionalEmails: filters.additionalEmails,
      includeCustomerEmails: filters.includeCustomerEmails,
    },
  }
})
