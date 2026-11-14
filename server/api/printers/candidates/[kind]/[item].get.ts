import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { candidateParamSchema } from '../../../../../shared/validators/printers'
import { engineFile, printApiError } from '../../../../services/printers'

/** A matching product photo the engine found for a printer model. */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'printers.manage.all')
  const params = validateParams(event, candidateParamSchema)
  try {
    const image = await engineFile(`/api/images/candidate/${params.kind}/${params.item}`)
    setHeader(event, 'content-type', image.contentType)
    setHeader(event, 'cache-control', image.cacheControl)
    setHeader(event, 'x-content-type-options', 'nosniff')
    setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
    return new Uint8Array(image.data)
  }
  catch (err) {
    throw printApiError(event, err, 'Could not load that picture')
  }
})
