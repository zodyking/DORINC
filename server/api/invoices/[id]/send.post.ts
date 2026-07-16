import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  InvoiceSendServiceError,
  queueInvoiceSend,
} from '../../../services/invoice-send.service'
import { isInvoiceResendable } from '../../../services/invoices.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'
import { invoiceSendSchema } from '../../../../shared/validators/invoices'

function mapError(event: Parameters<typeof apiError>[0], err: InvoiceSendServiceError) {
  switch (err.code) {
    case 'NOT_FOUND':
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    case 'INVALID_TRANSITION':
      throw apiError(event, 'CONFLICT', 'This invoice cannot be emailed from its current status')
    case 'MANAGER_APPROVAL_REQUIRED':
      throw apiError(event, 'FORBIDDEN', 'Manager approval is required before sending this invoice')
    case 'NO_RECIPIENT':
      throw apiError(event, 'VALIDATION_ERROR', 'No billing email is on file for this customer')
    case 'ALREADY_QUEUED':
      throw apiError(event, 'CONFLICT', 'This invoice is already queued for delivery')
    case 'NOTIFICATION_DISABLED':
      throw apiError(event, 'VALIDATION_ERROR', 'Invoice emails are disabled in Control Panel → Notifications')
    case 'PDF_FAILED':
      throw apiError(event, 'INTERNAL_ERROR', 'PDF generation failed — try again or contact support')
    default:
      throw err
  }
}

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'invoices.send.all')
  const { id } = validateParams(event, idParamSchema)

  // Body is optional: the one-click flows post nothing, the compose UI posts overrides.
  const rawBody = await readBody(event).catch(() => null)
  const parsedBody = invoiceSendSchema.safeParse(rawBody ?? {})
  const overrides = parsedBody.success ? parsedBody.data : {}

  try {
    const result = await queueInvoiceSend(useDb(), id, actor.id, overrides, actor.accountType)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: result.alreadyQueued ? 'invoices.send_queued' : 'invoices.send_queued',
      beforeData: { status: result.invoice.status },
      afterData: {
        status: result.invoice.status,
        sendJobId: result.job.id,
        recipientEmail: result.recipient.email,
        pdfJobId: result.pdfJobId,
      },
      changedFields: ['sendJobId'],
      permissionKey: 'invoices.send.all',
      riskLevel: 'sensitive',
    })

    return {
      invoice: result.invoice,
      job: {
        id: result.job.id,
        status: result.job.status,
      },
      recipientEmail: result.recipient.email,
      queued: true,
      alreadyQueued: result.alreadyQueued,
      message: result.alreadyQueued
        ? 'Invoice delivery is already in progress.'
        : isInvoiceResendable(result.invoice.status)
          ? 'Invoice queued for resend. Email delivery will begin shortly.'
          : 'Invoice queued for PDF generation and email delivery. Status will update to Sent after the email is delivered.',
    }
  }
  catch (err) {
    if (err instanceof InvoiceSendServiceError) mapError(event, err)
    throw err
  }
})
