import { useDb } from '../../../db/client'
import { createCategory } from '../../../services/catalog.service'
import { writeAudit } from '../../../services/audit.service'
import { requirePermission } from '../../../utils/require-permission'
import { validateBody } from '../../../utils/validate'
import { catalogCategoryCreateSchema } from '../../../../shared/validators/catalog'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  const body = await validateBody(event, catalogCategoryCreateSchema)

  const category = await createCategory(useDb(), body)

  await writeAudit(event, {
    entityType: 'catalog_category',
    entityId: category.id,
    action: 'catalog.categories.create',
    afterData: { name: category.name },
    permissionKey: 'catalog.manage.all',
  })

  return { category }
})
