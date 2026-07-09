import {
  exportDataExchangeTable,
} from '../../../../services/data-exchange.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { validateParams, validateQuery } from '../../../../utils/validate'
import { writeAudit } from '../../../../services/audit.service'
import {
  dataExchangeExportQuerySchema,
  dataExchangeTableParamSchema,
} from '../../../../../shared/validators/data-exchange'
import type { DataExchangeTableKey } from '../../../../../shared/data-exchange/tables'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { table } = validateParams(event, dataExchangeTableParamSchema)
  const { format } = validateQuery(event, dataExchangeExportQuerySchema)
  const db = useDb()

  const file = await exportDataExchangeTable(db, table as DataExchangeTableKey, format)

  await writeAudit(event, {
    entityType: 'data_exchange',
    entityId: table,
    action: 'data_exchange.export',
    afterData: { table, format, filename: file.filename },
    riskLevel: 'sensitive',
  })

  setHeader(event, 'Content-Type', file.contentType)
  setHeader(event, 'Content-Disposition', `attachment; filename="${file.filename}"`)
  return file.body
})
