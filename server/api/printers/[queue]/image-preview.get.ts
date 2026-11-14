import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { queueParamSchema } from '../../../../shared/validators/printers'
import { engineFile, printApiError } from '../../../services/printers'

/** The picture someone uploaded, before they choose to use it. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, queueParamSchema)
  try {
    const image = await engineFile(`/api/printers/${params.queue}/image/preview`)
    setHeader(event, 'content-type', image.contentType)
    setHeader(event, 'cache-control', 'private, no-store')
    setHeader(event, 'x-content-type-options', 'nosniff')
    setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    return new Uint8Array(image.data)
  }
  catch (err) {
    throw printApiError(event, err, 'Could not load the preview')
  }
})
