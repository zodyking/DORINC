import { useDb } from '../../../db/client'
import { writeAudit } from '../../../services/audit.service'
import {
  generateEstimatePdf,
  EstimatePdfServiceError,
} from '../../../services/estimate-pdf.service'
import { apiError } from '../../../utils/api-error'
import { rateLimitKeyFromUser, requireRateLimit } from '../../../utils/require-rate-limit'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { idParamSchema } from '../../../../shared/validators/common'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'estimates.generate_pdf.all')
  await requireRateLimit(event, 'pdf_gen', rateLimitKeyFromUser(actor.id))
  const { id } = validateParams(event, idParamSchema)

  try {
    const result = await generateEstimatePdf(useDb(), id, actor.id)

    await writeAudit(event, {
      entityType: 'estimate',
      entityId: id,
      action: result.alreadyExists ? 'estimates.generate_pdf.existing' : 'estimates.generate_pdf',
      afterData: {
        templateVersionId: result.templateVersionId,
        jobId: result.job?.id ?? null,
        estimateFileId: result.estimateFile?.id ?? null,
        alreadyExists: result.alreadyExists,
        jobStatus: result.job?.status ?? null,
      },
      permissionKey: 'estimates.generate_pdf.all',
      riskLevel: 'sensitive',
    })

    return {
      job: result.job,
      estimateFile: result.estimateFile,
      alreadyExists: result.alreadyExists,
      templateVersionId: result.templateVersionId,
    }
  }
  catch (err) {
    if (err instanceof EstimatePdfServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Estimate not found')
      if (err.code === 'NOT_FINALIZED') {
        throw apiError(event, 'CONFLICT', 'Official PDFs can only be generated for sent or approved estimates')
      }
    }
    throw err
  }
})
