import { readMultipartFormData } from 'h3'
import { useDb } from '../../../db/client'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { queueParamSchema } from '../../../../shared/validators/printers'
import { applyPrinterImage, PrintError } from '../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  const parts = await readMultipartFormData(event) || []
  const fields: Record<string, string> = {}
  let upload: { filename: string, data: Buffer, type?: string } | undefined
  for (const part of parts) {
    if (part.name === 'upload' && part.filename && part.data) {
      upload = { filename: part.filename, data: part.data, type: part.type }
    }
    else if (part.name && part.data) {
      fields[part.name] = part.data.toString('utf8')
    }
  }
  try {
    await applyPrinterImage(useDb(), params.queue, {
      action: fields.action || 'apply',
      illustration: fields.illustration,
      upload,
    })
    return { ok: true }
  }
  catch (err) {
    if (err instanceof PrintError) throw apiError(event, 'VALIDATION_ERROR', err.message)
    throw apiError(event, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Could not save image')
  }
})
