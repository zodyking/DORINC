import { useDb } from '../../../db/client'
import { proposeCatalogAudit } from '../../../services/catalog-ai.service'
import { requirePermission } from '../../../utils/require-permission'

/** Propose catalog audit findings (wording, type, category, duplicates). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'catalog.manage.all')
  return proposeCatalogAudit(useDb())
})
