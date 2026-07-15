import { setHeaders } from 'h3'
import { getPortalInvoicePdfDownload, PortalServiceError } from '../../../../services/portal.service'
import { useDb } from '../../../../db/client'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePortalCustomer } from '../../../../utils/require-portal'
import { validateParams } from '../../../../utils/validate'
import { idParamSchema } from '../../../../../shared/validators/common'

/** Download official invoice PDF — scoped to the signed-in customer's invoices (P2-05). */
export default defineEventHandler(async (event) => {
  const user = requirePortalCustomer(event)
  const { id } = validateParams(event, idParamSchema)

  try {
    const { record, file } = await getPortalInvoicePdfDownload(useDb(), user.customerId, id)

    await writeAudit(event, {
      entityType: 'invoice',
      entityId: id,
      action: 'portal.invoices.pdf_download',
      afterData: {
        invoiceFileId: record.id,
        fileId: file.id,
        sha256Hash: record.sha256Hash,
      },
      permissionKey: 'portal.read.own',
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
    if (err instanceof PortalServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    if (err instanceof PortalServiceError && err.code === 'NO_PDF') {
      throw apiError(event, 'NOT_FOUND', 'No PDF has been generated for this invoice yet')
    }
    if (err instanceof PortalServiceError && err.code === 'PORTAL_DISABLED') {
      throw apiError(event, 'FORBIDDEN', 'Portal access is disabled')
    }
    throw err
  }
})
