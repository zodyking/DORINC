import {
  DataExchangeServiceError,
  wipeDataExchangeTable,
} from '../../../../services/data-exchange.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { validateBody, validateParams } from '../../../../utils/validate'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import {
  dataExchangeTableParamSchema,
  dataExchangeWipeBodySchema,
} from '../../../../../shared/validators/data-exchange'
import type { DataExchangeTableKey } from '../../../../../shared/data-exchange/tables'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { table } = validateParams(event, dataExchangeTableParamSchema)
  const body = await validateBody(event, dataExchangeWipeBodySchema)

  try {
    const result = await wipeDataExchangeTable(useDb(), table as DataExchangeTableKey)

    await writeAudit(event, {
      entityType: 'data_exchange',
      entityId: table,
      action: 'data_exchange.wipe',
      afterData: { ...result, confirmation: body.confirmation },
      riskLevel: 'sensitive',
    })

    return result
  }
  catch (err) {
    if (err instanceof DataExchangeServiceError && err.code === 'NOT_WIPEABLE') {
      throw apiError(event, 'FORBIDDEN', err.message ?? 'This table cannot be wiped')
    }
    const message = err instanceof Error ? err.message : 'Wipe failed'
    throw apiError(event, 'CONFLICT', message)
  }
})
