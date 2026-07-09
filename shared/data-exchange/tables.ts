export type DataExchangeTableKey
  = | 'customers'
    | 'vehicles'
    | 'invoices'
    | 'invoice_line_items'
    | 'service_logs'
    | 'catalog_items'
    | 'users'
    | 'audit_logs'

export interface DataExchangeTableDef {
  key: DataExchangeTableKey
  label: string
  description: string
  importable: boolean
}

export const DATA_EXCHANGE_TABLES: DataExchangeTableDef[] = [
  {
    key: 'customers',
    label: 'Customers',
    description: 'Accounts, contacts, portal flags',
    importable: true,
  },
  {
    key: 'vehicles',
    label: 'Vehicles',
    description: 'Fleet units, VIN, customer link',
    importable: true,
  },
  {
    key: 'invoices',
    label: 'Invoices',
    description: 'Invoice headers — status, dates, totals (no line items)',
    importable: true,
  },
  {
    key: 'invoice_line_items',
    label: 'Invoice Line Items',
    description: 'Qty, rate, type, description per invoice',
    importable: true,
  },
  {
    key: 'service_logs',
    label: 'Service Logs',
    description: 'Metadata only — photos stay in file storage',
    importable: true,
  },
  {
    key: 'catalog_items',
    label: 'Catalog Items',
    description: 'Parts, labor rates, fees, SKUs',
    importable: true,
  },
  {
    key: 'users',
    label: 'Internal Users',
    description: 'Staff profiles and roles — no password hashes',
    importable: false,
  },
  {
    key: 'audit_logs',
    label: 'Audit Log',
    description: 'Export only — append-only, no import',
    importable: false,
  },
]

export function dataExchangeTable(key: string): DataExchangeTableDef | undefined {
  return DATA_EXCHANGE_TABLES.find(t => t.key === key)
}
