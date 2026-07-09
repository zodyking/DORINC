import { setHeaders } from 'h3'
import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  getEstimatePdfDownload,
  EstimatePdfServiceError,
} from '../../../services/estimate-pdf.service'
import { EstimatesServiceError, getEstimate } from '../../../services/estimates.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

/** Download the stored official estimate PDF from app_files (SPEC §9). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'estimates.generate_pdf.all')
  const { id } = validateParams(event, idParamSchema)

  try {
    await getEstimate(useDb(), id)
  }
  catch (err) {
    if (err instanceof EstimatesServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Estimate not found')
    }
    throw err
  }

  try {
    const { record, file } = await getEstimatePdfDownload(useDb(), id)

    await writeAudit(event, {
      entityType: 'estimate',
      entityId: id,
      action: 'estimates.pdf_download',
      afterData: {
        estimateFileId: record.id,
        fileId: file.id,
        sha256Hash: record.sha256Hash,
        templateVersionId: record.templateVersionId,
      },
      permissionKey: 'estimates.generate_pdf.all',
    })

    const safeName = file.originalFilename.replace(/["\\\r\n]/g, '_')
    setHeaders(event, {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.fileSizeBytes),
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Estimate-Pdf-Hash': record.sha256Hash,
    })
    return file.binaryData
  }
  catch (err) {
    if (err instanceof EstimatePdfServiceError && err.code === 'NO_PDF') {
      throw apiError(event, 'NOT_FOUND', 'No PDF has been generated for this estimate yet')
    }
    throw err
  }
})
