import { z } from 'zod'
import { DATA_EXCHANGE_TABLES } from '../data-exchange/tables'

const tableKeys = DATA_EXCHANGE_TABLES.map(t => t.key) as [string, ...string[]]

export const dataExchangeTableParamSchema = z.object({
  table: z.enum(tableKeys),
})

export const dataExchangeExportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
})

export const DATA_EXCHANGE_IMPORT_MODES = ['upsert', 'insert_only', 'dry_run'] as const
export type DataExchangeImportMode = (typeof DATA_EXCHANGE_IMPORT_MODES)[number]

export const dataExchangeImportModeSchema = z.enum(DATA_EXCHANGE_IMPORT_MODES)
