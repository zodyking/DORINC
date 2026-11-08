import { setHeaders } from 'h3'
import { useDb, hasDatabaseConfigured } from '../../../../../../db/client'
import { hasDatabaseConfig } from '../../../../../../services/runtime-config.service'
import {
  getPublicInvoicePdfDownload,
  PublicInvoiceServiceError,
  requirePublicInvoiceAccess,
} from '../../../../../../services/public-invoice.service'
import { apiError } from '../../../../../../utils/api-error'
import { validateParams } from '../../../../../../utils/validate'
import { publicInvoiceAccessParamSchema } from '../../../../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) {
    throw apiError(event, 'NOT_FOUND', 'Invoice not found')
  }

  const params = validateParams(event, publicInvoiceAccessParamSchema)

  try {
    const access = requirePublicInvoiceAccess(params)
    const { record, file } = await getPublicInvoicePdfDownload(useDb(), access.invoiceNumber, access)
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
    if (err instanceof PublicInvoiceServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    if (err instanceof PublicInvoiceServiceError && err.code === 'NO_PDF') {
      throw apiError(event, 'NOT_FOUND', 'No PDF has been generated for this invoice yet')
    }
    throw err
  }
})
