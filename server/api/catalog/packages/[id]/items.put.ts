import { useDb } from '../../../../db/client'
import { CatalogServiceError, setPackageItems } from '../../../../services/catalog.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateBody, validateParams } from '../../../../utils/validate'
import { catalogPackageItemsSetSchema } from '../../../../../shared/validators/catalog'
import { z } from 'zod'
import { uuidSchema } from '../../../../../shared/validators/common'

const paramsSchema = z.object({ id: uuidSchema })

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const { id } = validateParams(event, paramsSchema)
  const body = await validateBody(event, catalogPackageItemsSetSchema)

  try {
    const pkg = await setPackageItems(useDb(), id, body.items)

    await writeAudit(event, {
      entityType: 'catalog_package',
      entityId: id,
      action: 'catalog.packages.items.set',
      afterData: { name: pkg.name, itemCount: pkg.items.length },
      permissionKey: 'catalog.manage.all',
    })

    return { package: pkg }
  }
  catch (err) {
    if (err instanceof CatalogServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Package not found')
    }
    if (err instanceof CatalogServiceError && err.code === 'INVALID_PACKAGE_ITEM') {
      throw apiError(event, 'VALIDATION_ERROR', 'One or more catalog items are missing or archived')
    }
    throw err
  }
})
