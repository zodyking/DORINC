import { eq } from 'drizzle-orm'
import { useDb } from '../../db/client'
import { users } from '../../db/schema/auth'
import { apiError } from '../../utils/api-error'
import { hasPermission, requirePermission, type AuthContext } from '../../utils/require-permission'
import { validateBody } from '../../utils/validate'
import { sendToPrinterSchema } from '../../../shared/validators/printers'
import { InvoicePrintServiceError } from '../../services/invoice-print.service'
import { PrintError } from '../../services/printers'
import { sendAppDocument } from '../../services/printers/send-document'

/** Queue an invoice (or several) or the blank service log sheet on a shop printer. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.print.all')
  const auth = event.context.auth as AuthContext
  const body = await validateBody(event, sendToPrinterSchema)
  if (body.kind === 'invoice') {
    const canInvoice = hasPermission(event, 'invoices.read.all') || hasPermission(event, 'invoices.generate_pdf.all')
    if (!canInvoice) throw apiError(event, 'FORBIDDEN', 'You do not have permission to print invoices')
  }
  const db = useDb()
  const [actor] = await db.select({ name: users.name }).from(users).where(eq(users.id, auth.user.id)).limit(1)
  try {
    const result = await sendAppDocument(db, {
      kind: body.kind,
      queue: body.queue,
      invoiceIds: body.invoiceIds,
      copies: body.copies,
      sides: body.sides,
      actorUserId: auth.user.id,
      actorName: actor?.name || '',
    })
    return { ok: true, ...result }
  }
  catch (err) {
    if (err instanceof PrintError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    if (err instanceof InvoicePrintServiceError) {
      throw apiError(event, err.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'VALIDATION_ERROR', err.message)
    }
    throw apiError(event, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Could not send to the printer')
  }
})
