import { useDb } from '../../../../db/client'
import { archivePackage, CatalogServiceError } from '../../../../services/catalog.service'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import { requirePermission } from '../../../../utils/require-permission'
import { validateParams } from '../../../../utils/validate'
import { z } from 'zod'
import { uuidSchema } from '../../../../../shared/validators/common'

const paramsSchema = z.object({ id: uuidSchema })

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const { id } = validateParams(event, paramsSchema)

  try {
    const pkg = await archivePackage(useDb(), id)

    await writeAudit(event, {
      entityType: 'catalog_package',
      entityId: id,
      action: 'catalog.packages.archive',
      afterData: { name: pkg.name },
      permissionKey: 'catalog.manage.all',
    })

    return { package: pkg }
  }
  catch (err) {
    if (err instanceof CatalogServiceError && err.code === 'NOT_FOUND') {
      throw apiError(event, 'NOT_FOUND', 'Package not found')
    }
    if (err instanceof CatalogServiceError && err.code === 'ALREADY_ARCHIVED') {
      throw apiError(event, 'CONFLICT', 'Package is already archived')
    }
    throw err
  }
})
