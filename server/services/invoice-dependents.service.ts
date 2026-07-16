import { and, eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { estimates } from '../db/schema/estimates'
import { invoiceChangeRequests, serviceRequests } from '../db/schema/portal-requests'
import { serviceLogs } from '../db/schema/service-logs'

/** Shown on service logs when their linked invoice was removed. */
export const INVOICE_LINK_RELEASED_REASON = 'Linked invoice was deleted; ready to send to invoice again'

/**
 * Clears FK blockers and restores dependent entity statuses before an invoice is hard-deleted.
 */
export async function releaseInvoiceDependents(db: Db, invoiceId: string) {
  const now = new Date()

  await db.update(serviceLogs)
    .set({
      status: 'ready_for_review',
      invoiceId: null,
      statusReason: INVOICE_LINK_RELEASED_REASON,
      updatedAt: now,
    })
    .where(and(
      eq(serviceLogs.invoiceId, invoiceId),
      eq(serviceLogs.status, 'converted_to_invoice'),
    ))

  await db.update(serviceLogs)
    .set({ invoiceId: null, updatedAt: now })
    .where(eq(serviceLogs.invoiceId, invoiceId))

  await db.update(estimates)
    .set({
      status: 'approved',
      convertedInvoiceId: null,
      convertedAt: null,
      convertedBy: null,
      updatedAt: now,
    })
    .where(and(
      eq(estimates.convertedInvoiceId, invoiceId),
      eq(estimates.status, 'converted'),
    ))

  await db.update(estimates)
    .set({ convertedInvoiceId: null, updatedAt: now })
    .where(eq(estimates.convertedInvoiceId, invoiceId))

  await db.update(serviceRequests)
    .set({ resultInvoiceId: null, updatedAt: now })
    .where(eq(serviceRequests.resultInvoiceId, invoiceId))

  await db.update(invoiceChangeRequests)
    .set({ resultInvoiceId: null, updatedAt: now })
    .where(eq(invoiceChangeRequests.resultInvoiceId, invoiceId))

  await db.update(invoiceChangeRequests)
    .set({ invoiceId: null, updatedAt: now })
    .where(eq(invoiceChangeRequests.invoiceId, invoiceId))
}
