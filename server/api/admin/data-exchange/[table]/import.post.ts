import { readMultipartFormData } from 'h3'
import {
  importDataExchangeTable,
} from '../../../../services/data-exchange.service'
import { requirePermission } from '../../../../utils/require-permission'
import { useDb } from '../../../../db/client'
import { validateParams } from '../../../../utils/validate'
import { writeAudit } from '../../../../services/audit.service'
import { apiError } from '../../../../utils/api-error'
import {
  dataExchangeImportModeSchema,
  dataExchangeTableParamSchema,
} from '../../../../../shared/validators/data-exchange'
import type { DataExchangeTableKey } from '../../../../../shared/data-exchange/tables'

export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.admin.all')
  const { table } = validateParams(event, dataExchangeTableParamSchema)

  const parts = await readMultipartFormData(event)
  const filePart = parts?.find(p => p.name === 'file' && p.data?.length)
  if (!filePart?.data) {
    throw apiError(event, 'VALIDATION_ERROR', 'Upload a CSV or JSON file')
  }

  const modeRaw = parts?.find(p => p.name === 'mode')?.data?.toString('utf8') ?? 'dry_run'
  const modeParsed = dataExchangeImportModeSchema.safeParse(modeRaw)
  if (!modeParsed.success) {
    throw apiError(event, 'VALIDATION_ERROR', 'Invalid import mode')
  }

  const filename = filePart.filename ?? 'import.json'
  const raw = filePart.data.toString('utf8')

  try {
    const result = await importDataExchangeTable(
      useDb(),
      table as DataExchangeTableKey,
      raw,
      filename,
      modeParsed.data,
    )

    await writeAudit(event, {
      entityType: 'data_exchange',
      entityId: table,
      action: 'data_exchange.import',
      afterData: result,
      riskLevel: 'sensitive',
    })

    return result
  }
  catch (err) {
    throw apiError(event, 'VALIDATION_ERROR', err instanceof Error ? err.message : 'Import failed')
  }
})
