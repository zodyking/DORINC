import { requirePermission } from '../../../utils/require-permission'
import { validateParams } from '../../../utils/validate'
import { queueParamSchema } from '../../../../shared/validators/printers'
import { engineFile, printApiError } from '../../../services/printers'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.read.all')
  const params = validateParams(event, queueParamSchema)
  try {
    const image = await engineFile(`/api/printers/${params.queue}/image`)
    setHeader(event, 'content-type', image.contentType)
    // The page URL carries a version, so a settled picture can be cached.
    setHeader(event, 'cache-control', image.pending ? 'private, no-cache' : 'private, max-age=86400')
    setHeader(event, 'x-content-type-options', 'nosniff')
    setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    return new Uint8Array(image.data)
  }
  catch (err) {
    throw printApiError(event, err, 'Could not load the printer picture')
  }
})
