import { useDb } from '../../../db/client'
import { CatalogServiceError, createLaborRate } from '../../../services/catalog.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { catalogLaborRateCreateSchema } from '../../../../shared/validators/catalog'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, catalogLaborRateCreateSchema)

  try {
    const rate = await createLaborRate(useDb(), body, actor.id)

    await writeAudit(event, {
      entityType: 'catalog_labor_rate',
      entityId: rate.id,
      action: 'catalog.labor_rates.create',
      afterData: { name: rate.name, rate: rate.rate, taxable: rate.taxable },
      permissionKey: 'catalog.manage.all',
    })

    return { rate }
  }
  catch (err) {
    if (err instanceof CatalogServiceError) {
      if (err.code === 'NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Related catalog record not found')
      if (err.code === 'CATEGORY_NOT_FOUND') throw apiError(event, 'NOT_FOUND', 'Category not found')
    }
    throw err
  }
})
