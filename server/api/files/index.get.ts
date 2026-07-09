import { useDb } from '../../db/client'
import { listFilesByOwner } from '../../services/files.service'
import { requirePermission } from '../../utils/require-permission'
import { validateQuery } from '../../utils/validate'
import { fileListQuerySchema } from '../../../shared/validators/files'

/** File metadata for an owning entity — never includes blobs (SPEC §8). */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'files.read.all')
  const query = validateQuery(event, fileListQuerySchema)

  const items = await listFilesByOwner(useDb(), {
    ownerEntityType: query.ownerEntityType,
    ownerEntityId: query.ownerEntityId,
    fileKind: query.fileKind,
    includeArchived: query.includeArchived,
  })

  return { items }
})
