import { and, count, eq, ilike, inArray, isNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { accountTypes, users } from '../db/schema/auth'
import { auditLogs } from '../db/schema/audit'
import { catalogItems } from '../db/schema/catalog'
import { customerContacts, customerCredentialEmailLogs, customers, type Address } from '../db/schema/customers'
import { editingSessions } from '../db/schema/editing-sessions'
import { estimates } from '../db/schema/estimates'
import {
  INVOICE_CREATION_SOURCES,
  INVOICE_LINE_TYPES,
  INVOICE_STATUSES,
  invoiceFiles,
  invoiceLineItems,
  invoices,
  type InvoiceCreationSource,
  type InvoiceCustomerSnapshot,
  type InvoiceLineType,
  type InvoiceStatus,
  type InvoiceVehicleSnapshot,
} from '../db/schema/invoices'
import { lineAmount } from './invoice-totals.service'
import { toTitleCase } from '#shared/format/title-case'
import { normalizeLineType } from '#shared/line-item-types'
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

function parseImportAddress(value: unknown): Address | null {
  if (!value || typeof value !== 'object') return null
  const address = value as Record<string, unknown>
  const line1 = address.line1 != null ? String(address.line1).trim() : undefined
  const line2 = address.line2 != null ? String(address.line2).trim() : undefined
  const city = address.city != null ? String(address.city).trim() : undefined
  const state = address.state != null ? String(address.state).trim() : undefined
  const zip = address.zip != null ? String(address.zip).trim() : undefined
  if (!line1 && !line2 && !city && !state && !zip) return null
  return { line1, line2, city, state, zip }
}

function optionalImportText(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed || null
}

function optionalImportYear(value: unknown): number | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const year = Number(trimmed)
  return Number.isFinite(year) && year > 0 ? Math.round(year) : null
}

function formatImportDbError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Database error'
  const top = err as { message?: string, cause?: { message?: string, code?: string, constraint?: string } }
  const cause = top.cause
  if (cause?.code === '23505') {
    return `Duplicate record (${cause.constraint ?? 'unique constraint'})`
  }
  if (cause?.message) return cause.message
  if (top.message && !top.message.startsWith('Failed query')) return top.message
  return 'Database error'
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
    const displayName = toTitleCase(String(row.displayName ?? '').trim())
    if (!displayName) {
      errors.push(`Row ${i + 1}: displayName is required`)
      continue
    }
    const id = typeof row.id === 'string' ? row.id : undefined
    const billingAddress = parseImportAddress(row.billingAddress)
    const serviceAddress = parseImportAddress(row.serviceAddress)
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
          billingAddress,
          serviceAddress,
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
      billingAddress,
      serviceAddress,
      taxExempt: Boolean(row.taxExempt),
      paymentTerms: row.paymentTerms ? String(row.paymentTerms) : 'due_on_receipt',
      notes: row.notes ? String(row.notes) : null,
      portalEnabled: Boolean(row.portalEnabled),
    })
    inserted++
  }

  return { total: rows.length, inserted, updated, skipped, errors }
}

async function resolveCustomerIdForImport(
  db: Db,
  row: Record<string, unknown>,
): Promise<string | null> {
  const explicitId = String(row.customerId ?? '').trim()
  if (explicitId) {
    const resolved = await resolveExistingFk(db, 'customers', explicitId)
    if (resolved) return resolved
  }

  const customerName = String(row.customerName ?? row.customerDisplayName ?? '').trim()
  if (!customerName) return null

  const [match] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(sql`lower(trim(${customers.displayName})) = lower(trim(${customerName}))`)
    .limit(1)

  return match?.id ?? null
}

async function findVehicleIdByBusNumber(
  db: Db,
  customerId: string,
  busNumber: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(and(
      eq(vehicles.customerId, customerId),
      eq(vehicles.busNumber, busNumber),
      isNull(vehicles.archivedAt),
    ))
    .limit(1)
  return row?.id ?? null
}

function buildVehicleImportPatch(row: Record<string, unknown>, customerId: string) {
  const unitTypeRaw = String(row.unitType ?? 'truck').toLowerCase()
  const unitType = (['truck', 'bus', 'equipment', 'tractor', 'other'] as const).includes(unitTypeRaw as never)
    ? unitTypeRaw as 'truck' | 'bus' | 'equipment' | 'tractor' | 'other'
    : 'truck'
  const statusRaw = String(row.status ?? 'active').toLowerCase()
  const status = (['active', 'inactive', 'retired'] as const).includes(statusRaw as never)
    ? statusRaw as 'active' | 'inactive' | 'retired'
    : 'active'

  return {
    customerId,
    unitType,
    busNumber: optionalImportText(row.busNumber),
    unitTag: optionalImportText(row.unitTag),
    vin: optionalImportText(row.vin)?.toUpperCase() ?? null,
    plate: optionalImportText(row.plate),
    year: optionalImportYear(row.year),
    make: optionalImportText(row.make),
    model: optionalImportText(row.model),
    status,
    notes: optionalImportText(row.notes),
    updatedAt: new Date(),
  }
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
    try {
      const customerId = await resolveCustomerIdForImport(db, row)
      if (!customerId) {
        errors.push(`Row ${i + 1}: customerId or customerName is required`)
        continue
      }

      const [customer] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1)
      if (!customer) {
        errors.push(`Row ${i + 1}: customer not found for customerId/customerName — import customers first`)
        continue
      }

      if (mode === 'dry_run') continue

      const patch = buildVehicleImportPatch(row, customerId)
      const importId = optionalUuid(row.id) ?? undefined

      let targetId = importId
      if (targetId) {
        const [existingById] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, targetId))
        if (!existingById && patch.busNumber) {
          targetId = await findVehicleIdByBusNumber(db, customerId, patch.busNumber) ?? undefined
        }
      }
      else if (patch.busNumber) {
        targetId = await findVehicleIdByBusNumber(db, customerId, patch.busNumber) ?? undefined
      }

      if (targetId) {
        const [existing] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, targetId))
        if (existing) {
          if (mode === 'insert_only') { skipped++; continue }
          await db.update(vehicles).set(patch).where(eq(vehicles.id, targetId))
          updated++
          continue
        }
      }

      await db.insert(vehicles).values({ ...(importId ? { id: importId } : {}), ...patch })
      inserted++
    }
    catch (err) {
      errors.push(`Row ${i + 1}: ${formatImportDbError(err)}`)
    }
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
      itemType: (row.itemType as 'part' | 'labor' | 'fee') ?? 'labor',
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

function moneyField(value: unknown, fallback = '0'): string {
  if (value == null || value === '') return fallback
  const n = Number(String(value).replace(/[$,\s]/g, ''))
  if (!Number.isFinite(n)) return fallback
  return n.toFixed(2)
}

function optionalUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function parseInvoiceDate(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function parseCustomerSnapshot(raw: unknown): InvoiceCustomerSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const displayName = String(row.displayName ?? row.name ?? '').trim()
  if (!displayName) return null
  return {
    displayName,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    billingAddress: (row.billingAddress as InvoiceCustomerSnapshot['billingAddress']) ?? null,
    serviceAddress: (row.serviceAddress as InvoiceCustomerSnapshot['serviceAddress']) ?? null,
    taxExempt: Boolean(row.taxExempt),
    paymentTerms: row.paymentTerms ? String(row.paymentTerms) : 'due_on_receipt',
  }
}

function parseVehicleSnapshot(raw: unknown): InvoiceVehicleSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  return {
    unitType: String(row.unitType ?? 'truck'),
    busNumber: row.busNumber ? String(row.busNumber) : null,
    unitTag: row.unitTag ? String(row.unitTag) : null,
    vin: row.vin ? String(row.vin) : null,
    plate: row.plate ? String(row.plate) : null,
    year: row.year != null && row.year !== '' ? Number(row.year) : null,
    make: row.make ? String(row.make) : null,
    model: row.model ? String(row.model) : null,
    odometer: row.odometer != null ? String(row.odometer) : null,
    odometerUnit: row.odometerUnit ? String(row.odometerUnit) : 'mi',
  }
}

function parseImportLineItems(
  raw: unknown,
  rowIndex: number,
  errors: string[],
): Array<{
  id?: string
  lineType: InvoiceLineType
  catalogItemId: string | null
  catalogSnapshot: unknown
  description: string
  quantity: string
  unitPrice: string
  lineAmount: string
  taxable: boolean
  sortOrder: number
  priceOverridden: boolean
  priceOverrideReason: string | null
}> {
  if (raw == null) return []
  if (!Array.isArray(raw)) {
    errors.push(`Row ${rowIndex}: lineItems must be an array`)
    return []
  }

  const lines: ReturnType<typeof parseImportLineItems> = []
  for (let i = 0; i < raw.length; i++) {
    const item = normalizeImportRow((raw[i] ?? {}) as Record<string, unknown>)
    const description = String(item.description ?? item.name ?? '').trim()
    if (!description) {
      errors.push(`Row ${rowIndex} line ${i + 1}: description is required`)
      continue
    }

    const lineType = normalizeLineType(String(item.lineType ?? item.type ?? 'labor'))

    // Legacy aliases: qty / hours / hrs → quantity; rate → unitPrice; amount → lineAmount
    // Prefer a non-zero hours/qty alias when quantity is missing or zero (common legacy export bug).
    const quantityCandidates = [
      item.quantity,
      item.qty,
      item.hours,
      item.hrs,
      item.laborHours,
    ]
    let quantityRaw = quantityCandidates.find((v) => {
      if (v == null || v === '') return false
      return Number(String(v).replace(/[$,\s]/g, '')) !== 0
    }) ?? item.quantity ?? item.qty ?? item.hours ?? item.hrs ?? item.laborHours

    const unitPrice = moneyField(item.unitPrice ?? item.rate ?? item.price, '0.00')
    const amountRaw = item.lineAmount ?? item.amount ?? item.total

    // Legacy labor lines often store hours as 0 while keeping unitPrice + lineAmount
    const qtyNum = Number(String(quantityRaw ?? '').replace(/[$,\s]/g, ''))
    const priceNum = Number(unitPrice)
    const amountNum = amountRaw != null && amountRaw !== ''
      ? Number(String(amountRaw).replace(/[$,\s]/g, ''))
      : NaN
    if ((!Number.isFinite(qtyNum) || qtyNum === 0)
      && Number.isFinite(priceNum) && priceNum > 0
      && Number.isFinite(amountNum) && amountNum > 0) {
      quantityRaw = (amountNum / priceNum).toFixed(2)
    }

    const quantity = moneyField(quantityRaw, '1.00')
    const computed = lineAmount(quantity, unitPrice)
    const amount = amountRaw != null && amountRaw !== '' ? moneyField(amountRaw, computed) : computed

    lines.push({
      id: typeof item.id === 'string' ? item.id : undefined,
      lineType,
      catalogItemId: optionalUuid(item.catalogItemId),
      catalogSnapshot: item.catalogSnapshot ?? null,
      description,
      quantity,
      unitPrice,
      lineAmount: amount,
      taxable: item.taxable == null ? true : Boolean(item.taxable),
      sortOrder: item.sortOrder != null && item.sortOrder !== '' ? Number(item.sortOrder) : i,
      priceOverridden: Boolean(item.priceOverridden),
      priceOverrideReason: item.priceOverrideReason ? String(item.priceOverrideReason) : null,
    })
  }
  return lines
}

async function resolveExistingFk(
  db: Db,
  table: 'customers' | 'vehicles' | 'service_logs',
  id: string | null,
): Promise<string | null> {
  if (!id) return null
  if (table === 'customers') {
    const [row] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1)
    return row?.id ?? null
  }
  if (table === 'vehicles') {
    const [row] = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.id, id)).limit(1)
    return row?.id ?? null
  }
  const [row] = await db.select({ id: serviceLogs.id }).from(serviceLogs).where(eq(serviceLogs.id, id)).limit(1)
  return row?.id ?? null
}

async function resolveCustomerIdByIdOrName(
  db: Db,
  customerId: string | null,
  displayName: string | null | undefined,
): Promise<string | null> {
  const byId = await resolveExistingFk(db, 'customers', customerId)
  if (byId) return byId
  const name = displayName?.trim()
  if (!name) return null
  const [row] = await db.select({ id: customers.id })
    .from(customers)
    .where(and(ilike(customers.displayName, name), isNull(customers.archivedAt)))
    .limit(1)
  return row?.id ?? null
}

async function importInvoices(
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
    const invoiceDate = parseInvoiceDate(row.invoiceDate ?? row.date)
    if (!invoiceDate) {
      errors.push(`Row ${i + 1}: invoiceDate is required (YYYY-MM-DD)`)
      continue
    }

    const customerSnapshot = parseCustomerSnapshot(row.customerSnapshot)
      ?? (row.customerName || row.billTo
        ? parseCustomerSnapshot({
            displayName: row.customerName ?? row.billTo,
            email: row.customerEmail,
            phone: row.customerPhone,
            taxExempt: row.taxExempt,
            paymentTerms: row.paymentTerms,
          })
        : null)

    if (!customerSnapshot) {
      errors.push(`Row ${i + 1}: customerSnapshot.displayName (or customerName) is required`)
      continue
    }

    const statusRaw = String(row.status ?? 'draft').toLowerCase()
    const status = (INVOICE_STATUSES as readonly string[]).includes(statusRaw)
      ? statusRaw as InvoiceStatus
      : 'draft'

    const sourceRaw = String(row.creationSource ?? 'blank').toLowerCase()
    const creationSource = (INVOICE_CREATION_SOURCES as readonly string[]).includes(sourceRaw)
      ? sourceRaw as InvoiceCreationSource
      : 'blank'

    const lineItems = parseImportLineItems(row.lineItems ?? row.lines, i + 1, errors)
    const id = optionalUuid(row.id)
    const invoiceNumber = row.invoiceNumber != null && row.invoiceNumber !== ''
      ? Number(row.invoiceNumber)
      : null

    if (mode === 'dry_run') continue

    const customerId = await resolveCustomerIdByIdOrName(
      db,
      optionalUuid(row.customerId),
      customerSnapshot.displayName,
    )
    const vehicleId = await resolveExistingFk(db, 'vehicles', optionalUuid(row.vehicleId))
    const serviceLogId = await resolveExistingFk(db, 'service_logs', optionalUuid(row.serviceLogId))

    const header = {
      customerId,
      vehicleId,
      serviceLogId,
      estimateId: null as string | null,
      sourceInvoiceId: optionalUuid(row.sourceInvoiceId),
      creationSource,
      status,
      invoiceDate,
      dueDate: parseInvoiceDate(row.dueDate),
      paymentTerms: row.paymentTerms ? String(row.paymentTerms) : customerSnapshot.paymentTerms,
      customerSnapshot,
      vehicleSnapshot: parseVehicleSnapshot(row.vehicleSnapshot),
      serviceLocation: row.serviceLocation ? String(row.serviceLocation) : null,
      poNumber: row.poNumber ? String(row.poNumber) : null,
      complaint: row.complaint ? String(row.complaint) : null,
      internalNotes: row.internalNotes ? String(row.internalNotes) : null,
      customerNotes: row.customerNotes ? String(row.customerNotes) : null,
      subtotal: moneyField(row.subtotal),
      taxAmount: moneyField(row.taxAmount),
      discountAmount: moneyField(row.discountAmount),
      feesAmount: moneyField(row.feesAmount),
      total: moneyField(row.total),
      amountPaid: moneyField(row.amountPaid),
      balanceDue: moneyField(row.balanceDue ?? row.total),
      taxExempt: row.taxExempt == null ? customerSnapshot.taxExempt : Boolean(row.taxExempt),
      taxRate: row.taxRate != null && row.taxRate !== '' ? String(row.taxRate) : '0',
      shopSuppliesPercent: row.shopSuppliesPercent != null && row.shopSuppliesPercent !== ''
        ? moneyField(row.shopSuppliesPercent)
        : null,
      updatedAt: new Date(),
    }

    // Prefer stored totals; if missing but lines exist, derive from lines
    if ((row.subtotal == null || row.subtotal === '') && lineItems.length) {
      const derivedSubtotal = lineItems.reduce((sum, line) => sum + Number(line.lineAmount), 0)
      header.subtotal = derivedSubtotal.toFixed(2)
      if (row.total == null || row.total === '') {
        header.total = header.subtotal
        header.balanceDue = moneyField(
          Number(header.subtotal) - Number(header.amountPaid) + Number(header.taxAmount) + Number(header.feesAmount) - Number(header.discountAmount),
        )
      }
    }

    let existingId: string | null = null
    if (id) {
      const [byId] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, id)).limit(1)
      existingId = byId?.id ?? null
    }
    if (!existingId && invoiceNumber != null && Number.isFinite(invoiceNumber)) {
      const [byNum] = await db.select({ id: invoices.id }).from(invoices)
        .where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1)
      existingId = byNum?.id ?? null
    }

    if (existingId) {
      if (mode === 'insert_only') { skipped++; continue }
      await db.update(invoices).set(header).where(eq(invoices.id, existingId))
      await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, existingId))
      if (lineItems.length) {
        await db.insert(invoiceLineItems).values(lineItems.map(line => ({
          ...(line.id ? { id: line.id } : {}),
          invoiceId: existingId!,
          lineType: line.lineType,
          catalogItemId: line.catalogItemId,
          catalogSnapshot: line.catalogSnapshot as never,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineAmount: line.lineAmount,
          taxable: line.taxable,
          sortOrder: line.sortOrder,
          priceOverridden: line.priceOverridden,
          priceOverrideReason: line.priceOverrideReason,
        })))
      }
      updated++
      continue
    }

    const [created] = await db.insert(invoices).values({
      ...(id ? { id } : {}),
      ...(invoiceNumber != null && Number.isFinite(invoiceNumber) ? { invoiceNumber } : {}),
      ...header,
    }).returning({ id: invoices.id })

    if (lineItems.length && created) {
      await db.insert(invoiceLineItems).values(lineItems.map(line => ({
        ...(line.id ? { id: line.id } : {}),
        invoiceId: created.id,
        lineType: line.lineType,
        catalogItemId: line.catalogItemId,
        catalogSnapshot: line.catalogSnapshot as never,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineAmount: line.lineAmount,
        taxable: line.taxable,
        sortOrder: line.sortOrder,
        priceOverridden: line.priceOverridden,
        priceOverrideReason: line.priceOverrideReason,
      })))
    }
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
    case 'invoices':
      result = await importInvoices(db, rows, mode)
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
  // invoice_files.pdf_render_job_id blocks deleting pdf_render_jobs (ON DELETE NO ACTION)
  await db.update(invoiceFiles)
    .set({ pdfRenderJobId: null })
    .where(sql`${invoiceFiles.pdfRenderJobId} IS NOT NULL`)
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

/**
 * Wipe customers also removes portal logins. Sessions / tokens cascade from users;
 * contact + credential-log FKs must be cleared first.
 */
async function deleteCustomerPortalUsers(db: Db) {
  const [customerType] = await db.select({ id: accountTypes.id })
    .from(accountTypes)
    .where(eq(accountTypes.key, 'customer'))
    .limit(1)
  if (!customerType) return

  const portalUsers = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.accountTypeId, customerType.id))

  if (!portalUsers.length) return

  const ids = portalUsers.map(u => u.id)

  await db.update(customerContacts)
    .set({ portalUserId: null, updatedAt: new Date() })
    .where(inArray(customerContacts.portalUserId, ids))

  await db.delete(customerCredentialEmailLogs)
    .where(inArray(customerCredentialEmailLogs.portalUserId, ids))

  await db.delete(editingSessions)
    .where(inArray(editingSessions.userId, ids))

  await db.delete(users).where(inArray(users.id, ids))
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
      await deleteCustomerPortalUsers(db)
      await db.delete(customers)
      break
    default:
      throw new DataExchangeServiceError('NOT_WIPEABLE', 'This table cannot be wiped')
  }

  const remaining = await countTable(db, key)
  return { table: key, deleted: before - remaining, remaining }
}
