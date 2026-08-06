import { useDb } from '../../db/client'
import {
  bulkReconcileInvoices,
  type InvoiceReconcileSuccessRow,
} from '../../services/invoices.service'
import { getCustomer } from '../../services/customers.service'
import { resolveCustomerDisplayName } from '../../services/entity-snapshots'
import {
  postBulkInvoicePaymentStatusTeamMessage,
  postInvoicePaymentStatusTeamMessage,
} from '../../services/workflow-chat.service'
import { writeAudit } from '../../services/audit.service'
import { requirePermission } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { invoiceBulkReconcileSchema } from '../../../shared/validators/invoices'

async function resolveCustomerName(
  db: ReturnType<typeof useDb>,
  row: InvoiceReconcileSuccessRow,
): Promise<string> {
  if (row.customerId) {
    try {
      const customer = await getCustomer(db, row.customerId)
      return customer.displayName
    }
    catch {
      return resolveCustomerDisplayName(null, row.customerSnapshot) || 'Customer'
    }
  }
  return resolveCustomerDisplayName(null, row.customerSnapshot) || 'Customer'
}

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.record_payment.all')
  const body = await validateBody(event, invoiceBulkReconcileSchema)
  const db = useDb()

  const { results, succeeded } = await bulkReconcileInvoices(db, {
    invoiceIds: body.invoiceIds,
    action: body.action,
    paidAt: body.paidAt ? new Date(`${body.paidAt}T12:00:00`) : undefined,
  }, actor.id)

  if (succeeded.length === 1) {
    const row = succeeded[0]!
    const customerName = await resolveCustomerName(db, row)
    void postInvoicePaymentStatusTeamMessage(db, {
      senderUserId: actor.id,
      invoiceId: row.invoiceId,
      invoiceNumber: row.invoiceNumber,
      customerId: row.customerId,
      customerName,
      status: body.action,
    }).catch(() => {})
  }
  else if (succeeded.length > 1) {
    const enriched = await Promise.all(succeeded.map(async (row) => ({
      row,
      customerName: await resolveCustomerName(db, row),
    })))

    const byCustomer = new Map<string, {
      customerId: string | null
      customerName: string
      invoices: Array<{ invoiceId: string, invoiceNumber: number }>
    }>()

    for (const { row, customerName } of enriched) {
      const key = row.customerId ?? `name:${customerName.toLowerCase()}`
      const group = byCustomer.get(key)
      if (group) {
        group.invoices.push({
          invoiceId: row.invoiceId,
          invoiceNumber: row.invoiceNumber,
        })
        continue
      }
      byCustomer.set(key, {
        customerId: row.customerId,
        customerName,
        invoices: [{
          invoiceId: row.invoiceId,
          invoiceNumber: row.invoiceNumber,
        }],
      })
    }

    void postBulkInvoicePaymentStatusTeamMessage(db, {
      senderUserId: actor.id,
      status: body.action,
      groups: [...byCustomer.values()].map(group => ({
        customerId: group.customerId,
        customerName: group.customerName,
        count: group.invoices.length,
        invoices: group.invoices,
      })),
    }).catch(() => {})
  }

  const ok = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok).length

  await writeAudit(event, {
    entityType: 'invoice',
    entityId: succeeded[0]?.invoiceId ?? body.invoiceIds[0]!,
    action: 'invoices.bulk_reconcile',
    afterData: {
      action: body.action,
      requested: body.invoiceIds.length,
      ok,
      failed,
      invoiceIds: body.invoiceIds,
    },
    permissionKey: 'invoices.record_payment.all',
    riskLevel: 'sensitive',
  })

  return {
    results,
    summary: {
      requested: body.invoiceIds.length,
      ok,
      failed,
      action: body.action,
    },
  }
})
