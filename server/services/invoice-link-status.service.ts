import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { InvoiceStatus } from '../db/schema/invoices'
import { invoices } from '../db/schema/invoices'
import { auditLogs } from '../db/schema/audit'
import { editingSessions } from '../db/schema/editing-sessions'
import { workerJobs } from '../db/schema/jobs'
import { isEditingSessionNoise } from '../../shared/audit-messages'

export type ServiceLogInvoiceLinkStatusKey = 'queued' | 'in_progress' | 'sent'

export interface ServiceLogInvoiceLinkStatus {
  key: ServiceLogInvoiceLinkStatusKey
  label: string
}

export interface ServiceLogInvoiceLinkStatusInput {
  invoiceStatus: InvoiceStatus
  hasActiveEditSession: boolean
  wasOpenedOrModified: boolean
  hasPendingSend: boolean
}

const STATUS_LABELS: Record<ServiceLogInvoiceLinkStatusKey, string> = {
  queued: 'Queued',
  in_progress: 'In progress',
  sent: 'Sent',
}

/** Derive the service-log list sub-label for a linked invoice. */
export function deriveServiceLogInvoiceLinkStatus(
  input: ServiceLogInvoiceLinkStatusInput,
): ServiceLogInvoiceLinkStatus | null {
  if (input.invoiceStatus === 'sent' || input.invoiceStatus === 'paid') {
    return { key: 'sent', label: STATUS_LABELS.sent }
  }

  if (input.invoiceStatus === 'pending_manager_approval') {
    return { key: 'in_progress', label: STATUS_LABELS.in_progress }
  }

  if (input.invoiceStatus !== 'draft') {
    return null
  }

  if (input.hasActiveEditSession || input.wasOpenedOrModified || input.hasPendingSend) {
    return { key: 'in_progress', label: STATUS_LABELS.in_progress }
  }

  return { key: 'queued', label: STATUS_LABELS.queued }
}

function auditCountsAsOpenedOrModified(action: string): boolean {
  if (action === 'editing_sessions.acquire') return true
  if (action === 'invoices.create') return false
  return !isEditingSessionNoise(action)
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
    if (row.status === 'pending_manager_approval') {
      result.set(row.id, { key: 'in_progress', label: STATUS_LABELS.in_progress })
      continue
    }
    if (row.status === 'draft') {
      draftIds.push(row.id)
    }
  }

  if (!draftIds.length) return result

  const activeSessions = await db.select({ entityId: editingSessions.entityId })
    .from(editingSessions)
    .where(and(
      eq(editingSessions.entityType, 'invoice'),
      inArray(editingSessions.entityId, draftIds),
      isNull(editingSessions.releasedAt),
    ))
  const activeSessionIds = new Set(activeSessions.map(s => s.entityId))

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

  const openedOrModifiedIds = new Set<string>()
  for (const row of audits) {
    if (auditCountsAsOpenedOrModified(row.action)) {
      openedOrModifiedIds.add(row.entityId)
    }
  }

  const pendingSendRows = await db.select({ payload: workerJobs.payload })
    .from(workerJobs)
    .where(and(
      eq(workerJobs.jobType, 'invoice_send'),
      inArray(workerJobs.status, ['queued', 'processing']),
      or(...draftIds.map(id => sql`${workerJobs.payload}->>'invoiceId' = ${id}`)),
    ))
  const pendingSendIds = new Set(
    pendingSendRows
      .map(r => (r.payload as { invoiceId?: string }).invoiceId)
      .filter((id): id is string => !!id && draftIds.includes(id)),
  )

  for (const id of draftIds) {
    const status = deriveServiceLogInvoiceLinkStatus({
      invoiceStatus: 'draft',
      hasActiveEditSession: activeSessionIds.has(id),
      wasOpenedOrModified: openedOrModifiedIds.has(id),
      hasPendingSend: pendingSendIds.has(id),
    })
    if (status) result.set(id, status)
  }

  return result
}
