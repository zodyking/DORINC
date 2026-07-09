export type DataExchangeTableKey
  = | 'customers'
    | 'vehicles'
    | 'invoices'
    | 'service_logs'
    | 'catalog_items'
    | 'users'
    | 'audit_logs'

export interface DataExchangeTableDef {
  key: DataExchangeTableKey
  label: string
  description: string
  importable: boolean
  /** Destructive wipe — requires typing DELETE in the control panel. */
  wipeable: boolean
}

export const DATA_EXCHANGE_TABLES: DataExchangeTableDef[] = [
  {
    key: 'customers',
    label: 'Customers',
    description: 'Accounts, contacts — wipe also deletes portal logins',
    importable: true,
    wipeable: true,
  },
  {
    key: 'vehicles',
    label: 'Vehicles',
    description: 'Fleet units, VIN, customer link',
    importable: true,
    wipeable: true,
  },
  {
    key: 'invoices',
    label: 'Invoices',
    description: 'Invoice headers + nested line items (JSON import/export)',
    importable: true,
    wipeable: true,
  },
  {
    key: 'service_logs',
    label: 'Service Logs',
    description: 'Metadata only — photos stay in file storage',
    importable: true,
    wipeable: true,
  },
  {
    key: 'catalog_items',
    label: 'Catalog Items',
    description: 'Parts, labor rates, fees, SKUs',
    importable: true,
    wipeable: true,
  },
  {
    key: 'users',
    label: 'Internal Users',
    description: 'Staff profiles and roles — no password hashes',
    importable: false,
    wipeable: false,
  },
  {
    key: 'audit_logs',
    label: 'Audit Log',
    description: 'Export only — append-only, no import',
    importable: false,
    wipeable: false,
  },
]

export function dataExchangeTable(key: string): DataExchangeTableDef | undefined {
  return DATA_EXCHANGE_TABLES.find(t => t.key === key)
}
