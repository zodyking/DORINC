import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { InvoiceStatus } from '../db/schema/invoices'
import { invoices } from '../db/schema/invoices'
import { auditLogs } from '../db/schema/audit'
import { workerJobs } from '../db/schema/jobs'

export type ServiceLogInvoiceLinkStatusKey = 'queued' | 'in_progress' | 'sent'

export interface ServiceLogInvoiceLinkStatus {
  key: ServiceLogInvoiceLinkStatusKey
  label: string
}

export interface ServiceLogInvoiceLinkStatusInput {
  invoiceStatus: InvoiceStatus
  wasSavedAtLeastOnce: boolean
  hasPendingSend: boolean
}

const STATUS_LABELS: Record<ServiceLogInvoiceLinkStatusKey, string> = {
  queued: 'In queue',
  in_progress: 'Invoiced',
  sent: 'Sent',
}

const INVOICE_SAVE_AUDIT_ACTIONS = new Set([
  'invoices.update',
  'invoices.update_dates',
  'invoices.line_items.create',
  'invoices.line_items.update',
  'invoices.line_items.delete',
  'ai.line_audit.completed',
  'ai.line_audit.reviewed',
])

/** Derive the service-log list sub-label for a linked invoice. */
export function deriveServiceLogInvoiceLinkStatus(
  input: ServiceLogInvoiceLinkStatusInput,
): ServiceLogInvoiceLinkStatus | null {
  if (input.invoiceStatus === 'sent' || input.invoiceStatus === 'paid') {
    return { key: 'sent', label: STATUS_LABELS.sent }
  }

  if (input.invoiceStatus !== 'draft' && input.invoiceStatus !== 'pending_manager_approval') {
    return null
  }

  if (input.wasSavedAtLeastOnce || input.hasPendingSend) {
    return { key: 'in_progress', label: STATUS_LABELS.in_progress }
  }

  return { key: 'queued', label: STATUS_LABELS.queued }
}

function auditCountsAsSavedAtLeastOnce(action: string): boolean {
  return INVOICE_SAVE_AUDIT_ACTIONS.has(action)
}

/** Batch-resolve linked invoice sub-statuses for the service log list. */
export async function resolveServiceLogInvoiceLinkStatuses(
  db: Db,
  invoiceIds: string[],
): Promise<Map<string, ServiceLogInvoiceLinkStatus>> {
  const uniqueIds = [...new Set(invoiceIds.filter(Boolean))]
  const result = new Map<string, ServiceLogInvoiceLinkStatus>()
  if (!uniqueIds.length) return result

  const invoiceRows = await db.select({
    id: invoices.id,
    status: invoices.status,
  })
    .from(invoices)
    .where(inArray(invoices.id, uniqueIds))

  const draftIds: string[] = []
  for (const row of invoiceRows) {
    if (row.status === 'sent' || row.status === 'paid') {
      result.set(row.id, { key: 'sent', label: STATUS_LABELS.sent })
      continue
    }
    if (row.status === 'draft' || row.status === 'pending_manager_approval') {
      draftIds.push(row.id)
    }
  }

  if (!draftIds.length) return result

  const audits = await db.select({
    entityId: auditLogs.entityId,
    action: auditLogs.action,
  })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.entityType, 'invoice'),
      inArray(auditLogs.entityId, draftIds),
      ne(auditLogs.action, 'invoices.create'),
    ))

  const savedAtLeastOnceIds = new Set<string>()
  for (const row of audits) {
    if (auditCountsAsSavedAtLeastOnce(row.action)) {
      savedAtLeastOnceIds.add(row.entityId)
    }
  }

  const pendingSendRows = await db.select({ payload: workerJobs.payload })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.jobType, 'invoice_send'),
      inArray(workerJobs.status, ['queued', 'processing']),
      inArray(sql`${workerJobs.payload}->>'invoiceId'`, draftIds),
    ))
  const pendingSendIds = new Set(
    pendingSendRows
      .map(r => (r.payload as { invoiceId?: string }).invoiceId)
      .filter((id): id is string => !!id && draftIds.includes(id)),
  )

  for (const id of draftIds) {
    const status = deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'draft',
      wasSavedAtLeastOnce: savedAtLeastOnceIds.has(id),
      hasPendingSend: pendingSendIds.has(id),
    })
    if (status) result.set(id, status)
  }

  return result
}
