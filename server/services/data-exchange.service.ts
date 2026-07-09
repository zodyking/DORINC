import { count, eq, inArray, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import { auditLogs } from '../db/schema/audit'
import { catalogItems } from '../db/schema/catalog'
import { customers } from '../db/schema/customers'
import { editingSessions } from '../db/schema/editing-sessions'
import { estimates } from '../db/schema/estimates'
import { invoiceLineItems, invoices } from '../db/schema/invoices'
import { pdfRenderJobs } from '../db/schema/pdf-render-jobs'
import {
  invoiceChangeRequests,
  newVehicleRequests,
  portalGeneralRequests,
  serviceRequests,
  vehicleChangeRequests,
} from '../db/schema/portal-requests'
import { serviceLogs } from '../db/schema/service-logs'
import { vehicles } from '../db/schema/vehicles'
import {
  DATA_EXCHANGE_TABLES,
  type DataExchangeTableKey,
  dataExchangeTable,
} from '../../shared/data-exchange/tables'
import type { DataExchangeImportMode } from '../../shared/validators/data-exchange'

export interface DataExchangeTableSummary {
  key: DataExchangeTableKey
  label: string
  description: string
  importable: boolean
  wipeable: boolean
  rowCount: number
}

export type DataExchangeServiceErrorCode = 'NOT_WIPEABLE'

export class DataExchangeServiceError extends Error {
  constructor(public readonly code: DataExchangeServiceErrorCode, message?: string) {
    super(message ?? code)
  }
}

export interface DataExchangeWipeResult {
  table: DataExchangeTableKey
  deleted: number
  remaining: number
}

export interface DataExchangeImportResult {
  mode: DataExchangeImportMode
  table: DataExchangeTableKey
  total: number
  inserted: number
  updated: number
  skipped: number
  errors: string[]
}

function serializeCell(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0]!)
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsv(serializeCell(row[h]))).join(','))
  }
  return lines.join('\n')
}

function normalizeImportRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
    out[camel] = value
  }
  return out
}

function parseImportPayload(raw: string, filename: string): Record<string, unknown>[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (filename.endsWith('.json') || trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) return parsed.map(r => normalizeImportRow(r as Record<string, unknown>))
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown[] }).rows)) {
      return (parsed as { rows: Record<string, unknown>[] }).rows.map(normalizeImportRow)
    }
    throw new Error('JSON import must be an array of row objects')
  }

  const lines = trimmed.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) throw new Error('CSV import must include a header row and at least one data row')
  const headers = lines[0]!.split(',').map(h => h.trim())
  return lines.slice(1).map((line) => {
    const cols = line.split(',')
    const row: Record<string, unknown> = {}
    headers.forEach((header, i) => {
      row[header] = cols[i]?.trim() ?? ''
    })
    return normalizeImportRow(row)
  })
}

async function countTable(db: Db, key: DataExchangeTableKey): Promise<number> {
  switch (key) {
    case 'customers': {
      const [row] = await db.select({ value: count() }).from(customers)
      return Number(row?.value ?? 0)
    }
    case 'vehicles': {
      const [row] = await db.select({ value: count() }).from(vehicles)
      return Number(row?.value ?? 0)
    }
    case 'invoices': {
      const [row] = await db.select({ value: count() }).from(invoices)
      return Number(row?.value ?? 0)
    }
    case 'service_logs': {
      const [row] = await db.select({ value: count() }).from(serviceLogs)
      return Number(row?.value ?? 0)
    }
    case 'catalog_items': {
      const [row] = await db.select({ value: count() }).from(catalogItems)
      return Number(row?.value ?? 0)
    }
    case 'users': {
      const staffTypes = await db.select({ id: accountTypes.id })
        .from(accountTypes)
        .where(inArray(accountTypes.key, ['super_admin', 'admin', 'manager', 'accountant', 'mechanic', 'viewer', 'external_auditor']))
      const ids = staffTypes.map(t => t.id)
      if (!ids.length) return 0
      const [row] = await db.select({ value: count() }).from(users).where(inArray(users.accountTypeId, ids))
      return Number(row?.value ?? 0)
    }
    case 'audit_logs': {
      const [row] = await db.select({ value: count() }).from(auditLogs)
      return Number(row?.value ?? 0)
    }
    default:
      return 0
  }
}

export async function listDataExchangeTables(db: Db): Promise<DataExchangeTableSummary[]> {
  return Promise.all(DATA_EXCHANGE_TABLES.map(async (def) => {
    const rowCount = await countTable(db, def.key)
    return { ...def, rowCount }
  }))
}

async function fetchInvoiceExportRows(db: Db): Promise<Record<string, unknown>[]> {
  const invoiceRows = await db.select().from(invoices)
  const lineRows = await db.select().from(invoiceLineItems)
  const linesByInvoice = new Map<string, Record<string, unknown>[]>()

  for (const line of lineRows) {
    const bucket = linesByInvoice.get(line.invoiceId) ?? []
    bucket.push({ ...line })
    linesByInvoice.set(line.invoiceId, bucket)
  }

  return invoiceRows.map((invoice) => {
    const lineItems = (linesByInvoice.get(invoice.id) ?? [])
      .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
    return { ...invoice, lineItems }
  })
}

async function fetchExportRows(db: Db, key: DataExchangeTableKey): Promise<Record<string, unknown>[]> {
  switch (key) {
    case 'customers':
      return (await db.select().from(customers)).map(r => ({ ...r }))
    case 'vehicles':
      return (await db.select().from(vehicles)).map(r => ({ ...r }))
    case 'invoices':
      return fetchInvoiceExportRows(db)
    case 'service_logs':
      return (await db.select().from(serviceLogs)).map(r => ({ ...r }))
    case 'catalog_items':
      return (await db.select().from(catalogItems)).map(r => ({ ...r }))
    case 'users': {
      const rows = await db.select({
        id: users.id,
        name: users.name,
        email: users.email,
        username: users.username,
        accountType: accountTypes.key,
        isActive: users.isActive,
        emailVerifiedAt: users.emailVerifiedAt,
        approvedAt: users.approvedAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        disabledAt: users.disabledAt,
      })
        .from(users)
        .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
        .where(sql`${accountTypes.key} <> 'customer'`)
      return rows.map(r => ({ ...r }))
    }
    case 'audit_logs':
      return (await db.select().from(auditLogs).orderBy(sql`${auditLogs.createdAt} desc`).limit(50000)).map(r => ({ ...r }))
    default:
      return []
  }
}

export async function exportDataExchangeTable(
  db: Db,
  key: DataExchangeTableKey,
  format: 'csv' | 'json',
): Promise<{ filename: string, contentType: string, body: string }> {
  const def = dataExchangeTable(key)
  if (!def) throw new Error('Unknown table')

  const rows = await fetchExportRows(db, key)
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'json') {
    return {
      filename: `dorinc-${key}-${stamp}.json`,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ table: key, exportedAt: new Date().toISOString(), rows }, null, 2),
    }
  }

  if (key === 'invoices') {
    const headersOnly = rows.map(({ lineItems: _lineItems, ...invoice }) => invoice)
    return {
      filename: `dorinc-${key}-${stamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: rowsToCsv(headersOnly),
    }
  }

  return {
    filename: `dorinc-${key}-${stamp}.csv`,
    contentType: 'text/csv; charset=utf-8',
    body: rowsToCsv(rows),
  }
}

async function importCustomers(
  db: Db,
  rows: Record<string, unknown>[],
  mode: DataExchangeImportMode,
): Promise<Omit<DataExchangeImportResult, 'table' | 'mode'>> {
  let inserted = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const displayName = String(row.displayName ?? '').trim()
    if (!displayName) {
      errors.push(`Row ${i + 1}: displayName is required`)
      continue
    }
    const id = typeof row.id === 'string' ? row.id : undefined
    if (mode === 'dry_run') continue

    if (id) {
      const [existing] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id))
      if (existing) {
        if (mode === 'insert_only') { skipped++; continue }
        await db.update(customers).set({
          displayName,
          accountKind: (row.accountKind as 'fleet' | 'individual') ?? 'individual',
          email: row.email ? String(row.email) : null,
          phone: row.phone ? String(row.phone) : null,
          taxExempt: Boolean(row.taxExempt),
          paymentTerms: row.paymentTerms ? String(row.paymentTerms) : 'due_on_receipt',
          notes: row.notes ? String(row.notes) : null,
          portalEnabled: Boolean(row.portalEnabled),
          updatedAt: new Date(),
        }).where(eq(customers.id, id))
        updated++
        continue
      }
    }

    await db.insert(customers).values({
      ...(id ? { id } : {}),
      displayName,
      accountKind: (row.accountKind as 'fleet' | 'individual') ?? 'individual',
      email: row.email ? String(row.email) : null,
      phone: row.phone ? String(row.phone) : null,
      taxExempt: Boolean(row.taxExempt),
      paymentTerms: row.paymentTerms ? String(row.paymentTerms) : 'due_on_receipt',
      notes: row.notes ? String(row.notes) : null,
      portalEnabled: Boolean(row.portalEnabled),
    })
    inserted++
  }

  return { total: rows.length, inserted, updated, skipped, errors }
}

async function importVehicles(
  db: Db,
  rows: Record<string, unknown>[],
  mode: DataExchangeImportMode,
): Promise<Omit<DataExchangeImportResult, 'table' | 'mode'>> {
  let inserted = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const customerId = String(row.customerId ?? '').trim()
    if (!customerId) {
      errors.push(`Row ${i + 1}: customerId is required`)
      continue
    }
    if (mode === 'dry_run') continue

    const id = typeof row.id === 'string' ? row.id : undefined
    const patch = {
      customerId,
      unitType: (row.unitType as 'truck' | 'bus' | 'equipment' | 'tractor' | 'other') ?? 'truck',
      busNumber: row.busNumber ? String(row.busNumber) : null,
      unitTag: row.unitTag ? String(row.unitTag) : null,
      vin: row.vin ? String(row.vin) : null,
      plate: row.plate ? String(row.plate) : null,
      year: row.year != null && row.year !== '' ? Number(row.year) : null,
      make: row.make ? String(row.make) : null,
      model: row.model ? String(row.model) : null,
      status: (row.status as 'active' | 'inactive' | 'retired') ?? 'active',
      notes: row.notes ? String(row.notes) : null,
      updatedAt: new Date(),
    }

    if (id) {
      const [existing] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id))
      if (existing) {
        if (mode === 'insert_only') { skipped++; continue }
        await db.update(vehicles).set(patch).where(eq(vehicles.id, id))
        updated++
        continue
      }
    }

    await db.insert(vehicles).values({ ...(id ? { id } : {}), ...patch })
    inserted++
  }

  return { total: rows.length, inserted, updated, skipped, errors }
}

async function importCatalogItems(
  db: Db,
  rows: Record<string, unknown>[],
  mode: DataExchangeImportMode,
): Promise<Omit<DataExchangeImportResult, 'table' | 'mode'>> {
  let inserted = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const name = String(row.name ?? '').trim()
    if (!name) {
      errors.push(`Row ${i + 1}: name is required`)
      continue
    }
    if (mode === 'dry_run') continue

    const id = typeof row.id === 'string' ? row.id : undefined
    const patch = {
      itemType: (row.itemType as 'part' | 'service' | 'fee' | 'labor') ?? 'service',
      sku: row.sku ? String(row.sku) : null,
      name,
      description: row.description ? String(row.description) : null,
      defaultPrice: row.defaultPrice != null ? String(row.defaultPrice) : null,
      taxable: row.taxable == null ? true : Boolean(row.taxable),
      uom: row.uom ? String(row.uom) : 'each',
      updatedAt: new Date(),
    }

    if (id) {
      const [existing] = await db.select({ id: catalogItems.id }).from(catalogItems).where(eq(catalogItems.id, id))
      if (existing) {
        if (mode === 'insert_only') { skipped++; continue }
        await db.update(catalogItems).set(patch).where(eq(catalogItems.id, id))
        updated++
        continue
      }
    }

    await db.insert(catalogItems).values({ ...(id ? { id } : {}), ...patch })
    inserted++
  }

  return { total: rows.length, inserted, updated, skipped, errors }
}

export async function importDataExchangeTable(
  db: Db,
  key: DataExchangeTableKey,
  raw: string,
  filename: string,
  mode: DataExchangeImportMode,
): Promise<DataExchangeImportResult> {
  const def = dataExchangeTable(key)
  if (!def?.importable) throw new Error('This table cannot be imported')

  const rows = parseImportPayload(raw, filename)
  let result: Omit<DataExchangeImportResult, 'table' | 'mode'>

  switch (key) {
    case 'customers':
      result = await importCustomers(db, rows, mode)
      break
    case 'vehicles':
      result = await importVehicles(db, rows, mode)
      break
    case 'catalog_items':
      result = await importCatalogItems(db, rows, mode)
      break
    default:
      throw new Error(`Import for ${key} is not implemented yet — export and re-import via customers, vehicles, and catalog first`)
  }

  return { table: key, mode, ...result }
}

async function clearInvoiceForeignKeys(db: Db) {
  await db.update(serviceRequests)
    .set({ resultInvoiceId: null })
    .where(sql`${serviceRequests.resultInvoiceId} IS NOT NULL`)
  await db.update(invoiceChangeRequests)
    .set({ invoiceId: null, resultInvoiceId: null })
    .where(sql`${invoiceChangeRequests.invoiceId} IS NOT NULL OR ${invoiceChangeRequests.resultInvoiceId} IS NOT NULL`)
  await db.update(estimates)
    .set({ convertedInvoiceId: null })
    .where(sql`${estimates.convertedInvoiceId} IS NOT NULL`)
  await db.update(serviceLogs)
    .set({ invoiceId: null })
    .where(sql`${serviceLogs.invoiceId} IS NOT NULL`)
  await db.delete(pdfRenderJobs).where(eq(pdfRenderJobs.entityType, 'invoice'))
  await db.delete(editingSessions).where(eq(editingSessions.entityType, 'invoice'))
}

async function clearCustomerBlockingRows(db: Db) {
  await db.delete(newVehicleRequests)
  await db.delete(serviceRequests)
  await db.delete(invoiceChangeRequests)
  await db.delete(vehicleChangeRequests)
  await db.delete(portalGeneralRequests)
}

/** Permanently delete all rows in a workspace table (Control Panel — type DELETE to confirm). */
export async function wipeDataExchangeTable(
  db: Db,
  key: DataExchangeTableKey,
): Promise<DataExchangeWipeResult> {
  const def = dataExchangeTable(key)
  if (!def?.wipeable) {
    throw new DataExchangeServiceError('NOT_WIPEABLE', 'This table cannot be wiped')
  }

  const before = await countTable(db, key)

  switch (key) {
    case 'catalog_items':
      await db.delete(catalogItems)
      break
    case 'invoices':
      await clearInvoiceForeignKeys(db)
      await db.delete(invoices)
      break
    case 'service_logs':
      await db.update(invoices)
        .set({ serviceLogId: null })
        .where(sql`${invoices.serviceLogId} IS NOT NULL`)
      await db.delete(serviceLogs)
      break
    case 'vehicles':
      await db.delete(vehicles)
      break
    case 'customers':
      await clearCustomerBlockingRows(db)
      await db.delete(customers)
      break
    default:
      throw new DataExchangeServiceError('NOT_WIPEABLE', 'This table cannot be wiped')
  }

  const remaining = await countTable(db, key)
  return { table: key, deleted: before - remaining, remaining }
}
