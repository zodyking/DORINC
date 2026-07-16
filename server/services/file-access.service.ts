import type { H3Event } from 'h3'
import type { Db } from '../db/client'
import type { FileOwnerEntityType } from '../db/schema/files'
import { getServiceLog } from './service-logs.service'
import { getInvoice } from './invoices.service'
import { apiError } from '../utils/api-error'
import { hasPermission, type AuthContext } from '../utils/require-permission'

interface FileOwnerRef {
  ownerEntityType: FileOwnerEntityType
  ownerEntityId: string
}

/**
 * Staff may read file bytes when they have files.read.all, or when the file
 * belongs to an entity they can already read (e.g. own service log uploads).
 */
export async function assertCanReadFile(event: H3Event, db: Db, file: FileOwnerRef) {
  if (hasPermission(event, 'files.read.all')) return

  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  if (file.ownerEntityType === 'service_log') {
    const log = await getServiceLog(db, file.ownerEntityId)
    const allowed = hasPermission(event, 'service_logs.read.all')
      || hasPermission(event, 'service_logs.read.own', { ownsRecord: log.submittedBy === auth.user.id })
    if (allowed) return
  }

  if (file.ownerEntityType === 'invoice') {
    const invoice = await getInvoice(db, file.ownerEntityId)
    if (hasPermission(event, 'invoices.read.all')) return
    // Invoices linked to a readable service log (mechanic own uploads)
    if (invoice.serviceLogId) {
      const log = await getServiceLog(db, invoice.serviceLogId)
      const allowed = hasPermission(event, 'service_logs.read.all')
        || hasPermission(event, 'service_logs.read.own', { ownsRecord: log.submittedBy === auth.user.id })
      if (allowed) return
    }
  }

  throw apiError(event, 'FORBIDDEN', 'You do not have permission to view this file')
}
