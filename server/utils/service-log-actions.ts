import type { H3Event } from 'h3'
import type { Db } from '../db/client'
import type { ServiceLogStatus } from '../db/schema/service-logs'
import {
  getInvoiceRevertStatus,
  isServiceLogSendable,
} from '../services/service-logs.service'
import { hasPermission, type AuthContext } from './require-permission'

interface ServiceLogActionRow {
  status: ServiceLogStatus
  submittedBy: string
  invoiceId: string | null
}

/** Whether the actor may move a draft/uploaded log into the send-to-invoice queue. */
export function canMarkServiceLogReady(event: H3Event, log: ServiceLogActionRow): boolean {
  if (!['draft', 'uploaded'].includes(log.status)) return false
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) return false
  return hasPermission(event, 'service_logs.review.all')
    || hasPermission(event, 'service_logs.upload.own', { ownsRecord: log.submittedBy === auth.user.id })
}

export function canSendServiceLogToInvoice(event: H3Event, log: ServiceLogActionRow): boolean {
  if (!isServiceLogSendable(log.status)) return false
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) return false
  return hasPermission(event, 'service_logs.convert.all')
    || hasPermission(event, 'service_logs.convert.own', { ownsRecord: log.submittedBy === auth.user.id })
}

export async function canRevertServiceLogInvoice(
  event: H3Event,
  db: Db,
  log: ServiceLogActionRow,
): Promise<boolean> {
  if (log.status !== 'converted_to_invoice' || !log.invoiceId) return false
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) return false

  const allowed = hasPermission(event, 'service_logs.convert.all')
    || hasPermission(event, 'service_logs.revert_invoice.own', { ownsRecord: log.submittedBy === auth.user.id })
    || hasPermission(event, 'service_logs.convert.own', { ownsRecord: log.submittedBy === auth.user.id })
  if (!allowed) return false

  const status = await getInvoiceRevertStatus(db, log.invoiceId)
  return status.revertible
}
