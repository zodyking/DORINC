import { z } from 'zod'
import { useDb } from '../../db/client'
import { bulkDecodeMissingVehicleFields } from '../../services/vehicles.service'
import { writeAudit } from '../../services/audit.service'
import { requirePermission } from '../../utils/require-permission'

const bodySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

export default defineEventHandler(async (event) => {
  requirePermission(event, 'vehicles.decode_vin.all')
  requirePermission(event, 'vehicles.update.all')

  const raw = await readBody(event).catch(() => ({}))
  const parsed = bodySchema.safeParse(raw && typeof raw === 'object' ? raw : {})
  const limit = parsed.success ? parsed.data.limit : undefined

  const result = await bulkDecodeMissingVehicleFields(useDb(), { limit })

  await writeAudit(event, {
    entityType: 'vehicle',
    entityId: null,
    action: 'vehicles.bulk_decode_vin',
    afterData: {
      scanned: result.scanned,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
    },
    permissionKey: 'vehicles.decode_vin.all',
    riskLevel: 'sensitive',
  })

  return result
})
