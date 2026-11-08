import { useDb, hasDatabaseConfigured } from '../../../db/client'
import { hasDatabaseConfig } from '../../../services/runtime-config.service'
import {
  getPublicInvoicePage,
  PublicInvoiceServiceError,
  requirePublicInvoiceNumber,
} from '../../../services/public-invoice.service'
import { apiError } from '../../../utils/api-error'
import { validateParams } from '../../../utils/validate'
import { publicInvoiceNumberParamSchema } from '../../../../shared/validators/portal'

export default defineEventHandler(async (event) => {
  if (!hasDatabaseConfig() || !hasDatabaseConfigured()) {
    throw apiError(event, 'NOT_FOUND', 'Invoice not found')
  }

  const { number } = validateParams(event, publicInvoiceNumberParamSchema)

  try {
    const invoiceNumber = requirePublicInvoiceNumber(number)
    return await getPublicInvoicePage(useDb(), invoiceNumber)
  }
  catch (err) {
    if (err instanceof PublicInvoiceServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Invoice not found')
    }
    throw err
  }
})
