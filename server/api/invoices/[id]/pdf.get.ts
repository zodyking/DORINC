import { setHeaders } from 'h3'
import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  getInvoicePdfDownload,
  InvoicePdfServiceError,
} from '../../../services/invoice-pdf.service'
import { InvoicesServiceError, getInvoice } from '../../../services/invoices.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

/** Download the stored official invoice PDF from app_files (SPEC §9). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'invoices.generate_pdf.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    await getInvoice(useDb(), id)
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }

  try {
    const { record, file } = await getInvoicePdfDownload(useDb(), id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'invoices.pdf_download',
      afterData: {
        invoiceFileId: record.id,
        fileId: file.id,
        sha256Hash: record.sha256Hash,
        templateVersionId: record.templateVersionId,
      },
      permissionKey: 'invoices.generate_pdf.all',
    })

    const safeName = file.originalFilename.replace(/["\\\r\n]/g, '_')
    setHeaders(event, {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.fileSizeBytes),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Invoice-Pdf-Hash': record.sha256Hash,
    })
    return file.binaryData
  }
  catch (err) {
    if (err instanceof InvoicePdfServiceError && err.code === 'NO_PDF') {
      throw apiError(event, 'NOT_FOUND', 'No PDF has been generated for this invoice yet')
    }
    throw err
  }
})
