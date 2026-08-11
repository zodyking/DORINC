import type { Db } from '../db/client'
import {
  parseEntityLookupArgs,
  parseSearchCatalogArgs,
  type EntityLookupArgs,
  type SearchCatalogArgs,
} from '../../shared/ai-tools'
import {
  getInvoiceDetail,
  listInvoices,
  InvoicesServiceError,
} from './invoices.service'
import {
  getServiceLog,
  listServiceLogs,
  ServiceLogsServiceError,
} from './service-logs.service'
import {
  getCustomer,
  getCustomerBillingSummary,
  listContacts,
  listCustomers,
  CustomersServiceError,
} from './customers.service'
import {
  getCatalogItem,
  listCatalogItems,
  listLaborRates,
  listPackages,
  CatalogServiceError,
} from './catalog.service'
import {
  loadSusanAuthByUserId,
  susanHasPermission,
  type SusanAuthContext,
} from './susan-auth.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | undefined | null): value is string {
  return !!value && UUID_RE.test(value.trim())
}

function clampLimit(raw: number | undefined, fallback = 5): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(8, Math.max(1, Math.floor(n)))
}

function vehicleLabel(vehicle: {
  busNumber?: string | null
  unitTag?: string | null
  year?: number | string | null
  make?: string | null
  model?: string | null
} | null | undefined): string | null {
  if (!vehicle) return null
  const unit = vehicle.busNumber || vehicle.unitTag
  const ymm = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
  if (unit && ymm) return `${unit} (${ymm})`
  return unit || ymm || null
}

function money(value: unknown): string | null {
  if (value == null || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toFixed(2)
}

function deny(permission: string): { ok: boolean, content: string } {
  return {
    ok: false,
    content: `Permission denied: this staff member cannot use this lookup (needs ${permission}). Explain they lack access and how an admin can grant it in Users → permissions.`,
  }
}

function needAuth(): { ok: boolean, content: string } {
  return { ok: false, content: 'Unable to resolve staff permissions for this lookup.' }
}

function needQuery(): { ok: boolean, content: string } {
  return {
    ok: true,
    content: 'Provide id (UUID) and/or query text, then call again.',
  }
}

async function requireAuth(db: Db, userId: string): Promise<SusanAuthContext | null> {
  return loadSusanAuthByUserId(db, userId)
}

function formatInvoiceDetail(inv: Awaited<ReturnType<typeof getInvoiceDetail>>): string {
  const lines = (inv.lineItems ?? []).slice(0, 40).map((line, i) => {
    const snap = line.catalogSnapshot as { name?: string, sku?: string } | null
    const catalog = snap?.name
      ? ` catalog=${snap.name}${snap.sku ? ` (${snap.sku})` : ''}`
      : ''
    return `${i + 1}. [${line.lineType}] ${line.description} qty=${line.quantity} @ ${money(line.unitPrice)} = ${money(line.lineAmount)}${catalog}`
  })

  const vehicle = vehicleLabel(inv.vehicle ?? inv.vehicleSnapshot)
  const parts = [
    `Invoice ${inv.invoiceNumberFormatted}`,
    `id: ${inv.id}`,
    `status: ${inv.status}${inv.archivedAt ? ' (archived)' : ''}`,
    `customer: ${inv.customerName}`,
    vehicle ? `vehicle: ${vehicle}` : null,
    inv.serviceLogId ? `serviceLogId: ${inv.serviceLogId}` : null,
    `invoiceDate: ${inv.invoiceDate}`,
    `dueDate: ${inv.dueDate}`,
    inv.poNumber ? `poNumber: ${inv.poNumber}` : null,
    inv.paymentTerms ? `paymentTerms: ${inv.paymentTerms}` : null,
    `subtotal: ${money(inv.subtotal)}`,
    `tax: ${money(inv.taxAmount)}`,
    `total: ${money(inv.total)}`,
    `amountPaid: ${money(inv.amountPaid)}`,
    `balanceDue: ${money(inv.balanceDue)}`,
    inv.sentAt ? `sentAt: ${inv.sentAt}` : null,
    inv.paidAt ? `paidAt: ${inv.paidAt}` : null,
    inv.creationSource ? `creationSource: ${inv.creationSource}` : null,
    lines.length ? `lineItems (${lines.length}):\n${lines.join('\n')}` : 'lineItems: (none)',
  ]
  return parts.filter(Boolean).join('\n')
}

function formatInvoiceListItem(row: {
  id: string
  invoiceNumberFormatted: string
  status: string
  invoiceDate: string | Date
  dueDate: string | Date
  total: string | number
  balanceDue: string | number
  customerName: string
  vehicle?: { busNumber?: string | null, unitTag?: string | null, year?: number | null, make?: string | null, model?: string | null } | null
  vehicleSnapshot?: { busNumber?: string | null, unitTag?: string | null, year?: number | null, make?: string | null, model?: string | null } | null
  serviceLogNumber?: number | null
}): string {
  const vehicle = vehicleLabel(row.vehicle ?? row.vehicleSnapshot)
  return [
    `- ${row.invoiceNumberFormatted} [${row.status}] id=${row.id}`,
    `  customer=${row.customerName}`,
    vehicle ? `  vehicle=${vehicle}` : null,
    `  date=${row.invoiceDate} due=${row.dueDate} total=${money(row.total)} balance=${money(row.balanceDue)}`,
    row.serviceLogNumber != null ? `  serviceLog=SL-${String(row.serviceLogNumber).padStart(4, '0')}` : null,
  ].filter(Boolean).join('\n')
}

export async function executeLookupInvoice(
  db: Db,
  userId: string,
  argsRaw: unknown,
): Promise<{ ok: boolean, content: string }> {
  const auth = await requireAuth(db, userId)
  if (!auth) return needAuth()
  if (!susanHasPermission(auth, 'invoices.read.all')) return deny('invoices.read.all')

  const args = parseEntityLookupArgs(argsRaw)
  const limit = clampLimit(args.limit)

  if (isUuid(args.id)) {
    try {
      const inv = await getInvoiceDetail(db, args.id)
      return { ok: true, content: formatInvoiceDetail(inv) }
    }
    catch (e) {
      if (e instanceof InvoicesServiceError && e.code === 'NOT_FOUND') {
        return { ok: true, content: `No invoice found for id=${args.id}.` }
      }
      throw e
    }
  }

  const query = String(args.query || args.id || '').trim()
  if (!query) return needQuery()

  const result = await listInvoices(db, {
    q: query,
    includeArchived: false,
    page: 1,
    pageSize: limit,
  })

  if (!result.items.length) {
    return { ok: true, content: `No invoices matched query=${JSON.stringify(query)}.` }
  }

  if (result.items.length === 1) {
    const inv = await getInvoiceDetail(db, result.items[0]!.id)
    return { ok: true, content: formatInvoiceDetail(inv) }
  }

  return {
    ok: true,
    content: [
      `Found ${result.total} invoice(s) (showing ${result.items.length}). Ask which id to open for full detail.`,
      ...result.items.map(formatInvoiceListItem),
    ].join('\n'),
  }
}

function formatServiceLogDetail(log: Awaited<ReturnType<typeof getServiceLog>>): string {
  const label = `SL-${String(log.logNumber).padStart(4, '0')}`
  const vehicle = vehicleLabel(log.vehicle)
  const draft = Array.isArray(log.draftLineItems)
    ? (log.draftLineItems as Array<Record<string, unknown>>).slice(0, 20).map((line, i) => {
        const desc = String(line.description ?? line.name ?? 'line')
        const qty = line.quantity ?? line.qty ?? 1
        const price = line.unitPrice ?? line.price ?? null
        return `${i + 1}. ${desc} qty=${qty}${price != null ? ` @ ${money(price)}` : ''}`
      })
    : []

  return [
    `Service log ${label}`,
    `id: ${log.id}`,
    `status: ${log.status}${log.archivedAt ? ' (archived)' : ''}`,
    `customer: ${log.customerName}`,
    vehicle ? `vehicle: ${vehicle}` : null,
    `submitter: ${log.submitterName}`,
    `serviceDate: ${log.serviceDate}`,
    log.dueDate ? `dueDate: ${log.dueDate}` : null,
    log.workType ? `workType: ${log.workType}` : null,
    log.location ? `location: ${log.location}` : null,
    log.odometerReading != null ? `odometer: ${log.odometerReading}` : null,
    log.complaint ? `complaint: ${String(log.complaint).slice(0, 280)}` : null,
    log.customerRequested ? 'customerRequested: true' : null,
    log.invoiceId ? `invoiceId: ${log.invoiceId}` : 'invoiceId: (none)',
    draft.length ? `draftLineItems (${draft.length}):\n${draft.join('\n')}` : 'draftLineItems: (none)',
  ].filter(Boolean).join('\n')
}

function formatServiceLogListItem(row: {
  id: string
  logNumber: number
  status: string
  serviceDate: string | Date
  customerName: string
  submitterName?: string | null
  vehicle?: { busNumber?: string | null, unitTag?: string | null, year?: number | null, make?: string | null, model?: string | null } | null
  invoiceNumberFormatted?: string | null
  fileCount?: number
}): string {
  const vehicle = vehicleLabel(row.vehicle)
  return [
    `- SL-${String(row.logNumber).padStart(4, '0')} [${row.status}] id=${row.id}`,
    `  customer=${row.customerName}`,
    vehicle ? `  vehicle=${vehicle}` : null,
    `  serviceDate=${row.serviceDate}`,
    row.submitterName ? `  submitter=${row.submitterName}` : null,
    row.invoiceNumberFormatted ? `  invoice=${row.invoiceNumberFormatted}` : null,
    row.fileCount != null ? `  files=${row.fileCount}` : null,
  ].filter(Boolean).join('\n')
}

export async function executeLookupServiceLog(
  db: Db,
  userId: string,
  argsRaw: unknown,
): Promise<{ ok: boolean, content: string }> {
  const auth = await requireAuth(db, userId)
  if (!auth) return needAuth()

  const canReadAll = susanHasPermission(auth, 'service_logs.read.all')
  const canReadOwn = susanHasPermission(auth, 'service_logs.read.own')
  if (!canReadAll && !canReadOwn) {
    return deny('service_logs.read.all or service_logs.read.own')
  }

  const args = parseEntityLookupArgs(argsRaw)
  const limit = clampLimit(args.limit)
  const ownOnly = !canReadAll && canReadOwn

  if (isUuid(args.id)) {
    try {
      const log = await getServiceLog(db, args.id)
      if (ownOnly && log.submittedBy !== auth.user.id) {
        return deny('service_logs.read.all (this log belongs to another submitter)')
      }
      return { ok: true, content: formatServiceLogDetail(log) }
    }
    catch (e) {
      if (e instanceof ServiceLogsServiceError && e.code === 'NOT_FOUND') {
        return { ok: true, content: `No service log found for id=${args.id}.` }
      }
      throw e
    }
  }

  const query = String(args.query || args.id || '').trim()
  if (!query) return needQuery()

  const result = await listServiceLogs(db, {
    q: query,
    includeArchived: false,
    submittedBy: ownOnly ? auth.user.id : undefined,
    page: 1,
    pageSize: limit,
  })

  if (!result.items.length) {
    return { ok: true, content: `No service logs matched query=${JSON.stringify(query)}.` }
  }

  if (result.items.length === 1) {
    const log = await getServiceLog(db, result.items[0]!.id)
    if (ownOnly && log.submittedBy !== auth.user.id) {
      return deny('service_logs.read.all (this log belongs to another submitter)')
    }
    return { ok: true, content: formatServiceLogDetail(log) }
  }

  return {
    ok: true,
    content: [
      `Found ${result.total} service log(s) (showing ${result.items.length}). Ask which id to open for full detail.`,
      ...result.items.map(formatServiceLogListItem),
    ].join('\n'),
  }
}

function cityStateFromAddress(addr: { city?: string, state?: string } | null | undefined): string {
  if (!addr) return ''
  return [addr.city, addr.state].filter(Boolean).join(', ')
}

function formatCustomerDetail(
  customer: Awaited<ReturnType<typeof getCustomer>>,
  contacts: Awaited<ReturnType<typeof listContacts>>,
  billing: Awaited<ReturnType<typeof getCustomerBillingSummary>>,
): string {
  const primary = contacts.find(c => c.isPrimary) ?? contacts[0]
  const cityState = cityStateFromAddress(customer.billingAddress)
    || cityStateFromAddress(customer.serviceAddress)

  return [
    `Customer ${customer.displayName}`,
    `id: ${customer.id}`,
    `accountKind: ${customer.accountKind}${customer.archivedAt ? ' (archived)' : ''}`,
    customer.email ? `email: ${customer.email}` : null,
    customer.phone ? `phone: ${customer.phone}` : null,
    cityState ? `location: ${cityState}` : null,
    `taxExempt: ${customer.taxExempt ? 'yes' : 'no'}`,
    customer.paymentTerms ? `paymentTerms: ${customer.paymentTerms}` : null,
    `portalEnabled: ${customer.portalEnabled ? 'yes' : 'no'}`,
    primary
      ? `primaryContact: ${primary.name}${primary.email ? ` <${primary.email}>` : ''}${primary.phone ? ` ${primary.phone}` : ''}`
      : 'primaryContact: (none)',
    `contacts: ${contacts.length}`,
    `billing: invoices=${billing.invoiceCount} open=${billing.openInvoiceCount} openBalance=${money(billing.openBalance)} lifetimeBilled=${money(billing.lifetimeBilled)}`,
  ].filter(Boolean).join('\n')
}

function formatCustomerListItem(row: {
  id: string
  displayName: string
  accountKind: string
  email?: string | null
  phone?: string | null
  portalEnabled?: boolean
  openBalance?: string | number
  openInvoiceCount?: number
  vehicleCount?: number
  primaryContact?: { name?: string | null } | null
}): string {
  return [
    `- ${row.displayName} [${row.accountKind}] id=${row.id}`,
    row.email ? `  email=${row.email}` : null,
    row.phone ? `  phone=${row.phone}` : null,
    row.primaryContact?.name ? `  primaryContact=${row.primaryContact.name}` : null,
    `  portal=${row.portalEnabled ? 'on' : 'off'} vehicles=${row.vehicleCount ?? 0} openInvoices=${row.openInvoiceCount ?? 0} openBalance=${money(row.openBalance)}`,
  ].filter(Boolean).join('\n')
}

export async function executeLookupCustomer(
  db: Db,
  userId: string,
  argsRaw: unknown,
): Promise<{ ok: boolean, content: string }> {
  const auth = await requireAuth(db, userId)
  if (!auth) return needAuth()
  if (!susanHasPermission(auth, 'customers.read.all')) return deny('customers.read.all')

  const args = parseEntityLookupArgs(argsRaw)
  const limit = clampLimit(args.limit)

  if (isUuid(args.id)) {
    try {
      const customer = await getCustomer(db, args.id)
      const [contacts, billing] = await Promise.all([
        listContacts(db, customer.id),
        getCustomerBillingSummary(db, customer.id),
      ])
      return { ok: true, content: formatCustomerDetail(customer, contacts, billing) }
    }
    catch (e) {
      if (e instanceof CustomersServiceError && e.code === 'NOT_FOUND') {
        return { ok: true, content: `No customer found for id=${args.id}.` }
      }
      throw e
    }
  }

  const query = String(args.query || args.id || '').trim()
  if (!query) return needQuery()

  const result = await listCustomers(db, {
    q: query,
    includeArchived: false,
    page: 1,
    pageSize: limit,
  })

  if (!result.items.length) {
    return { ok: true, content: `No customers matched query=${JSON.stringify(query)}.` }
  }

  if (result.items.length === 1) {
    const customer = await getCustomer(db, result.items[0]!.id)
    const [contacts, billing] = await Promise.all([
      listContacts(db, customer.id),
      getCustomerBillingSummary(db, customer.id),
    ])
    return { ok: true, content: formatCustomerDetail(customer, contacts, billing) }
  }

  return {
    ok: true,
    content: [
      `Found ${result.total} customer(s) (showing ${result.items.length}). Ask which id to open for full detail.`,
      ...result.items.map(formatCustomerListItem),
    ].join('\n'),
  }
}

function formatCatalogItem(item: {
  id: string
  itemType: string
  sku?: string | null
  name: string
  description?: string | null
  categoryName?: string | null
  defaultPrice?: string | number | null
  uom?: string | null
  taxable?: boolean
  vendor?: string | null
  archivedAt?: Date | string | null
}): string {
  const price = money(item.defaultPrice)
  const priceLine = price != null
    ? `  price=${price}${item.uom ? ` / ${item.uom}` : ''}${item.taxable == null ? '' : ` taxable=${item.taxable ? 'yes' : 'no'}`}`
    : (item.taxable == null ? null : `  taxable=${item.taxable ? 'yes' : 'no'}`)
  return [
    `- [${item.itemType}] ${item.name}${item.sku ? ` (${item.sku})` : ''} id=${item.id}`,
    item.categoryName ? `  category=${item.categoryName}` : null,
    priceLine,
    item.vendor ? `  vendor=${item.vendor}` : null,
    item.description ? `  desc=${String(item.description).slice(0, 160)}` : null,
    item.archivedAt ? '  archived=yes' : null,
  ].filter(Boolean).join('\n')
}

export async function executeSearchCatalog(
  db: Db,
  userId: string,
  argsRaw: unknown,
): Promise<{ ok: boolean, content: string }> {
  const auth = await requireAuth(db, userId)
  if (!auth) return needAuth()
  if (!susanHasPermission(auth, 'catalog.read.all')) return deny('catalog.read.all')

  const args = parseSearchCatalogArgs(argsRaw)
  const query = String(args.query || '').trim()
  if (!query) {
    return { ok: true, content: 'Provide a catalog query (name/SKU/description), then call again.' }
  }
  const limit = clampLimit(args.limit)
  const sections: string[] = []

  const wantItems = !args.itemType || args.itemType === 'part' || args.itemType === 'labor' || args.itemType === 'fee'
  const wantPackages = !args.itemType || args.itemType === 'package'
  const wantRates = !args.itemType || args.itemType === 'rate'

  if (wantItems) {
    const itemType = args.itemType === 'part' || args.itemType === 'labor' || args.itemType === 'fee'
      ? args.itemType
      : undefined
    const items = await listCatalogItems(db, {
      q: query,
      itemType,
      includeArchived: false,
      page: 1,
      pageSize: limit,
    })
    if (items.items.length) {
      sections.push(
        `Catalog items (${items.total} match, showing ${items.items.length}):`,
        ...items.items.map(formatCatalogItem),
      )
    }
    else if (isUuid(query)) {
      try {
        const one = await getCatalogItem(db, query)
        sections.push('Catalog item by id:', formatCatalogItem(one))
      }
      catch (e) {
        if (!(e instanceof CatalogServiceError && e.code === 'NOT_FOUND')) throw e
      }
    }
  }

  if (wantPackages) {
    const packages = await listPackages(db, {
      q: query,
      includeArchived: false,
      page: 1,
      pageSize: limit,
    })
    if (packages.items.length) {
      sections.push(
        `Packages (${packages.total} match, showing ${packages.items.length}):`,
        ...packages.items.map(pkg => formatCatalogItem({
          id: pkg.id,
          itemType: 'package',
          sku: pkg.sku,
          name: pkg.name,
          description: pkg.description
            ? `${pkg.description} (${pkg.itemCount} items)`
            : `${pkg.itemCount} items`,
          categoryName: pkg.categoryName,
        })),
      )
    }
  }

  if (wantRates) {
    const rates = await listLaborRates(db, {
      q: query,
      includeArchived: false,
      page: 1,
      pageSize: limit,
    })
    if (rates.items.length) {
      sections.push(
        `Labor rates (${rates.total} match, showing ${rates.items.length}):`,
        ...rates.items.map(rate => formatCatalogItem({
          id: rate.id,
          itemType: 'rate',
          sku: rate.sku,
          name: rate.name,
          description: rate.description,
          defaultPrice: rate.rate,
          uom: rate.uom || 'hr',
          taxable: rate.taxable,
        })),
      )
    }
  }

  if (!sections.length) {
    return { ok: true, content: `No catalog matches for query=${JSON.stringify(query)}.` }
  }

  return { ok: true, content: sections.join('\n') }
}

/** Exported for tests — pure helpers */
export const __entityToolTestUtils = {
  isUuid,
  clampLimit,
  parseEntityLookupArgs,
  parseSearchCatalogArgs,
}

export type { EntityLookupArgs, SearchCatalogArgs }
