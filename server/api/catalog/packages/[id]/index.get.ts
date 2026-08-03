import { CatalogServiceError, getPackage } from '../../../../services/catalog.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { validateParams } from '../../../../utils/validate'
import { apiError } from '../../../../utils/api-error'
import { z } from 'zod'
import { uuidSchema } from '../../../../../shared/validators/common'

const paramsSchema = z.object({ id: uuidSchema })

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.read.all')
  const { id } = validateParams(event, paramsSchema)

  try {
    const pkg = await getPackage(useDb(), id)
    return { package: pkg }
  }
  catch (err) {
    if (err instanceof CatalogServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Package not found')
    }
    throw err
  }
})
