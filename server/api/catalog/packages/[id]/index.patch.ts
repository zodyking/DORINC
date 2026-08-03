import { useDb } from '../../../../db/client'
import { CatalogServiceError, updatePackage } from '../../../../services/catalog.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { catalogPackageUpdateSchema } from '../../../../../shared/validators/catalog'
import { z } from 'zod'
import { uuidSchema } from '../../../../../shared/validators/common'

const paramsSchema = z.object({ id: uuidSchema })

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const { id } = validateParams(event, paramsSchema)
  const body = await validateBody(event, catalogPackageUpdateSchema)

  try {
    const { pkg, before, changedFields } = await updatePackage(useDb(), id, body)

    await writeAudit(event, {
      entityType: 'catalog_package',
      entityId: id,
      action: 'catalog.packages.update',
      beforeData: { name: before.name, sku: before.sku },
      afterData: { name: pkg.name, sku: pkg.sku, changedFields },
      permissionKey: 'catalog.manage.all',
    })

    return { package: pkg }
  }
  catch (err) {
    if (err instanceof CatalogServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Package not found')
    }
    if (err instanceof CatalogServiceError && err.code === 'CATEGORY_NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Category not found')
    }
    throw err
  }
})
