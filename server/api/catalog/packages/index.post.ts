import { useDb } from '../../../db/client'
import { CatalogServiceError, createPackage } from '../../../services/catalog.service'
import { writeAudit } from '../../../services/audit.service'
import { apiError } from '../../../utils/api-error'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { catalogPackageCreateSchema } from '../../../../shared/validators/catalog'

export default defineEventHandler(async (event) => {
  const actor = requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, catalogPackageCreateSchema)

  try {
    const { items, ...header } = body
    const pkg = await createPackage(useDb(), header, actor.id, items ?? [])

    await writeAudit(event, {
      entityType: 'catalog_package',
      entityId: pkg.id,
      action: 'catalog.packages.create',
      afterData: { name: pkg.name, sku: pkg.sku, itemCount: pkg.items.length },
      permissionKey: 'catalog.manage.all',
    })

    return { package: pkg }
  }
  catch (err) {
    if (err instanceof CatalogServiceError && err.code === 'CATEGORY_NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Category not found')
    }
    if (err instanceof CatalogServiceError && err.code === 'INVALID_PACKAGE_ITEM') {
      throw apiError(event, 'VALIDATION_ERROR', 'One or more catalog items are missing or archived')
    }
    throw err
  }
})
