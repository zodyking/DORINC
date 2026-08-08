import { setResponseHeader } from 'h3'
import { useDb } from '../../db/client'
import { writeAudit } from '../../services/audit.service'
import {
  bulkPrintInvoices,
  InvoicePrintServiceError,
} from '../../services/invoice-print.service'
import { apiError } from '../../utils/api-error'
import { hasPermission, type AuthContext } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { invoiceBulkPrintSchema } from '../../../shared/validators/invoices'

/** Merge selected invoices (newest → oldest) for local print or Staples PrintMe. */
export default defineEventHandler(async (event) => {
  const auth = event.context.auth as AuthContext | undefined
  if (!auth?.user) throw apiError(event, 'UNAUTHENTICATED', 'Authentication required')

  const canPrint = hasPermission(event, 'invoices.read.all')
    || hasPermission(event, 'invoices.generate_pdf.all')
    || hasPermission(event, 'staples.print.all')
  if (!canPrint) {
    throw apiError(event, 'FORBIDDEN', 'You do not have permission to print invoices')
  }

  const body = await validateBody(event, invoiceBulkPrintSchema)

  try {
    const result = await bulkPrintInvoices(useDb(), auth.user.id, body)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: body.invoiceIds[0]!,
      action: body.mode === 'staples' ? 'invoices.bulk_print_staples' : 'invoices.bulk_print_device',
      afterData: {
        invoiceIds: body.invoiceIds,
        mode: body.mode,
        count: body.invoiceIds.length,
        jobId: result.mode === 'staples' ? result.job.id : null,
      },
      permissionKey: 'invoices.read.all',
      riskLevel: 'sensitive',
    })

    if (result.mode === 'staples') {
      return { mode: 'staples' as const, job: result.job }
    }

    setResponseHeader(event, 'Content-Type', 'application/pdf')
    setResponseHeader(event, 'Content-Disposition', `inline; filename="${result.filename}"`)
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return new Uint8Array(result.pdf)
  }
  catch (err) {
    if (err instanceof InvoicePrintServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', err.message)
      if (err.code === 'VALIDATION') throw apiError(event, 'VALIDATION_ERROR', err.message)
      throw apiError(event, 'INTERNAL_ERROR', err.message)
    }
    throw err
  }
})
