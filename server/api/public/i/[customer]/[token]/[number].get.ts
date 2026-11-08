import { useDb, hasDatabaseConfigured } from '../../../../../db/client'
import { hasDatabaseConfig } from '../../../../../services/runtime-config.service'
import {
  getPublicInvoicePage,
  PublicInvoiceServiceError,
  requirePublicInvoiceAccess,
} from '../../../../../services/public-invoice.service'
import { apiError } from '../../../../../utils/api-error'
import { validateParams } from '../../../../../utils/validate'
import { publicInvoiceAccessParamSchema } from '../../../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) {
    throw apiError(event, 'NOT_FOUND', 'Invoice not found')
  }

  const params = validateParams(event, publicInvoiceAccessParamSchema)

  try {
    const access = requirePublicInvoiceAccess(params)
    return await getPublicInvoicePage(useDb(), access.invoiceNumber, access)
  }
  catch (err) {
    if (err instanceof PublicInvoiceServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }
})
