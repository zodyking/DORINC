import { useDb } from '../../../db/client'
import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { apiError } from '../../../utils/api-error'
import { queueParamSchema } from '../../../../shared/validators/printers'
import { printerImageBytes } from '../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.read.all')
  const params = validateParams(event, queueParamSchema)
  const image = await printerImageBytes(useDb(), params.queue)
  if (!image) throw apiError(event, 'NOT_FOUND', 'Printer not found')
  setHeader(event, 'content-type', image.contentType)
  setHeader(event, 'cache-control', 'private, max-age=60')
  return image.body
})
