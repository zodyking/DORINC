import type { Db } from '../db/client'
import {
  parseEntityLookupArgs,
  parseInvoiceLookupArgs,
  parseSearchCatalogArgs,
  type EntityLookupArgs,
  type SearchCatalogArgs,
} from '../../shared/ai-tools'
import {
  extractInvoiceNumber,
  extractServiceLogNumber,
  inferInvoiceStatus,
  inferInvoiceSort,
  inferServiceLogStatus,
  refersToCurrentRecord,
  residualInvoiceSearchQuery,
  type InvoiceLookupStatus,
} from '../../shared/susan-entity-query'
import {
  findInvoiceIdByNumber,
  getInvoiceDetail,
  getInvoiceListStats,
  listInvoices,
  InvoicesServiceError,
} from './invoices.service'
import {
  findServiceLogIdByNumber,
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
  getPackage,
  listCatalogItems,
  listLaborRates,
  listPackages,
  CatalogServiceError,
} from './catalog.service'
import {
  formatSusanPermissionDenial,
  loadSusanAuthByUserId,
  susanPermissionDecision,
  type SusanAuthContext,
} from './susan-auth.service'

export type EntityToolContext = {
  entityType?: 'invoice' | 'service_log' | 'customer' | null
  entityId?: string | null
}

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

function deny(
  auth: SusanAuthContext,
  permission: Parameters<typeof susanPermissionDecision>[1],
  options?: { ownsRecord?: boolean },
): { ok: boolean, content: string } {
  const decision = susanPermissionDecision(auth, permission, options)
  return {
    ok: false,
    content: formatSusanPermissionDenial(permission, decision)
      || `Permission denied: needs ${permission}.`,
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

function currentEntityId(
  ctx: EntityToolContext | undefined,
  expected: EntityToolContext['entityType'],
  query: string,
  explicitId?: string,
): string | null {
  if (isUuid(explicitId)) return explicitId
  if (ctx?.entityType === expected && isUuid(ctx.entityId) && refersToCurrentRecord(query)) {
    return ctx.entityId!
  }
  return null
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

function formatInvoiceStats(stats: Awaited<ReturnType<typeof getInvoiceListStats>>): string {
  return [
    'Invoice KPI summary (non-archived):',
    `total: ${stats.total}`,
    `draftLike: ${stats.draftCount} (includes pending_manager_approval: ${stats.pendingManagerApprovalCount})`,
    `sent: ${stats.sentCount}`,
    `paid: ${stats.paidCount}`,
    `unpaid/outstanding (sent with balanceDue > 0): count=${stats.outstandingCount} balanceTotal=${money(stats.outstandingTotal)}`,
    `overdue (sent, past due, balanceDue > 0): count=${stats.overdueCount} balanceTotal=${money(stats.overdueTotal)}`,
    `paidThisMonthTotal: ${money(stats.paidThisMonthTotal)}`,
  ].join('\n')
}

async function loadInvoiceDetail(db: Db, id: string): Promise<{ ok: boolean, content: string }> {
  try {
    const inv = await getInvoiceDetail(db, id)
    return { ok: true, content: formatInvoiceDetail(inv) }
  }
  catch (e) {
    if (e instanceof InvoicesServiceError && e.code === 'NOT_FOUND') {
      return { ok: true, content: `No invoice found for id=${id}.` }
    }
    throw e
  }
}

export async function executeLookupInvoice(
  db: Db,
  userId: string,
  argsRaw: unknown,
  ctx: EntityToolContext = {},
): Promise<{ ok: boolean, content: string }> {
  const auth = await requireAuth(db, userId)
  if (!auth) return needAuth()
  const invoicePerm = susanPermissionDecision(auth, 'invoices.read.all')
  if (!invoicePerm.allowed) return deny(auth, 'invoices.read.all')

  const args = parseInvoiceLookupArgs(argsRaw)
  const limit = clampLimit(args.limit)
  const query = String(args.query || '').trim()
  const invoiceNumber = extractInvoiceNumber(query) || extractInvoiceNumber(String(args.id || ''))
  // Concrete invoice numbers always win over status buckets ("INV-000713 unpaid").
  const status: InvoiceLookupStatus | undefined = invoiceNumber != null
    ? undefined
    : (args.status || inferInvoiceStatus(query) || undefined)
  const residualQ = residualInvoiceSearchQuery(query)
  const sort = args.sort === 'oldest' || args.sort === 'newest'
    ? args.sort
    : (inferInvoiceSort(query) ?? undefined)

  const pageId = currentEntityId(ctx, 'invoice', query || 'this invoice', args.id)
  if (pageId && !invoiceNumber && !status && !sort) {
    return loadInvoiceDetail(db, pageId)
  }

  if (isUuid(args.id) && !invoiceNumber) {
    return loadInvoiceDetail(db, args.id)
  }

  if (invoiceNumber != null) {
    const id = await findInvoiceIdByNumber(db, invoiceNumber)
    if (!id) {
      return {
        ok: true,
        content: `No invoice found for INV-${String(invoiceNumber).padStart(6, '0')} (number ${invoiceNumber}).`,
      }
    }
    return loadInvoiceDetail(db, id)
  }

  if (status) {
    const stats = await getInvoiceListStats(db)

    if (status === 'stats') {
      return { ok: true, content: formatInvoiceStats(stats) }
    }

    if (status === 'unpaid' || status === 'outstanding') {
      const listed = await listInvoices(db, {
        outstanding: true,
        q: residualQ || undefined,
        includeArchived: false,
        page: 1,
        pageSize: limit,
        sort: 'due_date',
      })
      return {
        ok: true,
        content: [
          formatInvoiceStats(stats),
          '',
          residualQ ? `Filtered unpaid search q=${JSON.stringify(residualQ)}` : null,
          `Unpaid/outstanding: KPI count=${stats.outstandingCount}, listing ${listed.items.length} of ${listed.total}.`,
          listed.items.length
            ? listed.items.map(formatInvoiceListItem).join('\n')
            : '(none)',
        ].filter(Boolean).join('\n'),
      }
    }

    if (status === 'overdue') {
      const listed = await listInvoices(db, {
        overdue: true,
        q: residualQ || undefined,
        includeArchived: false,
        page: 1,
        pageSize: limit,
        sort: 'due_date',
      })
      return {
        ok: true,
        content: [
          formatInvoiceStats(stats),
          '',
          residualQ ? `Filtered overdue search q=${JSON.stringify(residualQ)}` : null,
          `Overdue: KPI count=${stats.overdueCount}, listing ${listed.items.length} of ${listed.total}.`,
          listed.items.length
            ? listed.items.map(formatInvoiceListItem).join('\n')
            : '(none)',
        ].filter(Boolean).join('\n'),
      }
    }

    const result = await listInvoices(db, {
      status,
      q: residualQ || undefined,
      includeArchived: false,
      page: 1,
      pageSize: limit,
    })
    return {
      ok: true,
      content: [
        formatInvoiceStats(stats),
        '',
        `Invoices with status=${status}: ${result.total} total (showing ${result.items.length}).`,
        result.items.length
          ? result.items.map(formatInvoiceListItem).join('\n')
          : '(none)',
      ].join('\n'),
    }
  }

  if (!query && pageId) return loadInvoiceDetail(db, pageId)

  if (sort === 'oldest' || sort === 'newest') {
    const listed = await listInvoices(db, {
      q: residualQ || undefined,
      includeArchived: false,
      page: 1,
      pageSize: 1,
      sort,
    })
    if (!listed.items.length) {
      return { ok: true, content: 'No invoices found.' }
    }
    const label = sort === 'oldest' ? 'Oldest invoice' : 'Newest invoice'
    const detail = await loadInvoiceDetail(db, listed.items[0]!.id)
    return {
      ok: true,
      content: `${label} (${listed.total} total).\n${detail.content}`,
    }
  }

  if (!query) return needQuery()

  const result = await listInvoices(db, {
    q: query,
    includeArchived: false,
    page: 1,
    pageSize: limit,
  })

  if (!result.items.length) {
    return {
      ok: true,
      content: [
        `No invoices matched query=${JSON.stringify(query)}.`,
        'Tips: use INV-000713 (or invoice 713), a customer name, bus/unit, PO, or status=unpaid|overdue|paid|stats.',
      ].join('\n'),
    }
  }

  if (result.items.length === 1) {
    return loadInvoiceDetail(db, result.items[0]!.id)
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
  ctx: EntityToolContext = {},
): Promise<{ ok: boolean, content: string }> {
  const auth = await requireAuth(db, userId)
  if (!auth) return needAuth()

  const allDec = susanPermissionDecision(auth, 'service_logs.read.all')
  const ownDec = susanPermissionDecision(auth, 'service_logs.read.own')
  const canReadAll = allDec.allowed
  const canReadOwn = ownDec.allowed
  if (!canReadAll && !canReadOwn) {
    return deny(auth, 'service_logs.read.all')
  }

  const args = parseEntityLookupArgs(argsRaw)
  const limit = clampLimit(args.limit)
  const ownOnly = !canReadAll && canReadOwn
  const query = String(args.query || '').trim()
  const statusFilter = extractServiceLogNumber(query) ? null : inferServiceLogStatus(query)

  async function detailIfAllowed(id: string, notFoundLabel?: string) {
    try {
      const log = await getServiceLog(db, id)
      if (ownOnly && log.submittedBy !== auth.user.id) {
        // Same wording as missing — do not leak that another submitter's log exists.
        return {
          ok: true,
          content: notFoundLabel || `No service log found for id=${id}.`,
        }
      }
      return { ok: true, content: formatServiceLogDetail(log) }
    }
    catch (e) {
      if (e instanceof ServiceLogsServiceError && e.code === 'NOT_FOUND') {
        return { ok: true, content: notFoundLabel || `No service log found for id=${id}.` }
      }
      throw e
    }
  }

  const pageId = currentEntityId(ctx, 'service_log', query || 'this log', args.id)
  if (pageId && !extractServiceLogNumber(query) && !statusFilter) {
    return detailIfAllowed(pageId)
  }

  if (isUuid(args.id) && !extractServiceLogNumber(query)) {
    return detailIfAllowed(args.id)
  }

  const logNumber = extractServiceLogNumber(query) ?? extractServiceLogNumber(String(args.id || ''))
  if (logNumber != null) {
    const id = await findServiceLogIdByNumber(db, logNumber)
    const label = `No service log found for SL-${String(logNumber).padStart(4, '0')} (number ${logNumber}).`
    if (!id) return { ok: true, content: label }
    return detailIfAllowed(id, label)
  }

  if (statusFilter) {
    const result = await listServiceLogs(db, {
      status: statusFilter === 'review' ? undefined : statusFilter,
      queue: statusFilter === 'review' ? 'review' : undefined,
      includeArchived: false,
      submittedBy: ownOnly ? auth.user.id : undefined,
      page: 1,
      pageSize: limit,
    })
    return {
      ok: true,
      content: [
        `Service logs filter=${statusFilter}: ${result.total} total (showing ${result.items.length}).`,
        result.items.length
          ? result.items.map(formatServiceLogListItem).join('\n')
          : '(none)',
      ].join('\n'),
    }
  }

  if (!query && pageId) return detailIfAllowed(pageId)
  if (!query) return needQuery()

  const result = await listServiceLogs(db, {
    q: query,
    includeArchived: false,
    submittedBy: ownOnly ? auth.user.id : undefined,
    page: 1,
    pageSize: limit,
  })

  if (!result.items.length) {
    return {
      ok: true,
      content: [
        `No service logs matched query=${JSON.stringify(query)}.`,
        'Tips: use SL-0713, a customer name, bus/unit tag, or ask for the review queue.',
      ].join('\n'),
    }
  }

  if (result.items.length === 1) {
    return detailIfAllowed(result.items[0]!.id)
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

async function loadCustomerDetail(db: Db, id: string): Promise<{ ok: boolean, content: string }> {
  try {
    const customer = await getCustomer(db, id)
    const [contacts, billing] = await Promise.all([
      listContacts(db, customer.id),
      getCustomerBillingSummary(db, customer.id),
    ])
    return { ok: true, content: formatCustomerDetail(customer, contacts, billing) }
  }
  catch (e) {
    if (e instanceof CustomersServiceError && e.code === 'NOT_FOUND') {
      return { ok: true, content: `No customer found for id=${id}.` }
    }
    throw e
  }
}

export async function executeLookupCustomer(
  db: Db,
  userId: string,
  argsRaw: unknown,
  ctx: EntityToolContext = {},
): Promise<{ ok: boolean, content: string }> {
  const auth = await requireAuth(db, userId)
  if (!auth) return needAuth()
  const decision = susanPermissionDecision(auth, 'customers.read.all')
  if (!decision.allowed) return deny(auth, 'customers.read.all')

  const args = parseEntityLookupArgs(argsRaw)
  const limit = clampLimit(args.limit)
  const query = String(args.query || '').trim()
  const qLower = query.toLowerCase()

  const pageId = currentEntityId(ctx, 'customer', query || 'this customer', args.id)
  if (pageId && !query) return loadCustomerDetail(db, pageId)
  if (pageId && refersToCurrentRecord(query)) return loadCustomerDetail(db, pageId)

  if (isUuid(args.id)) return loadCustomerDetail(db, args.id)

  const kind = /\bfleet\b/.test(qLower) ? 'fleet' as const
    : /\bindividual\b/.test(qLower) ? 'individual' as const
      : undefined
  const portal = /\bportal\s*(on|enabled|yes)\b/.test(qLower) ? true
    : /\bportal\s*(off|disabled|no)\b/.test(qLower) ? false
      : undefined
  const searchQ = query
    .replace(/\b(fleet|individual|portal\s*(on|off|enabled|disabled|yes|no))\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!searchQ && !kind && portal === undefined && pageId) {
    return loadCustomerDetail(db, pageId)
  }
  if (!searchQ && !kind && portal === undefined) return needQuery()

  const result = await listCustomers(db, {
    q: searchQ || undefined,
    kind,
    portal,
    includeArchived: false,
    page: 1,
    pageSize: limit,
  })

  if (!result.items.length) {
    return { ok: true, content: `No customers matched query=${JSON.stringify(query)}.` }
  }

  if (result.items.length === 1) {
    return loadCustomerDetail(db, result.items[0]!.id)
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
  const decision = susanPermissionDecision(auth, 'catalog.read.all')
  if (!decision.allowed) return deny(auth, 'catalog.read.all')

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
    if (packages.items.length === 1) {
      const full = await getPackage(db, packages.items[0]!.id)
      const lines = full.items.slice(0, 30).map((line, i) => (
        `${i + 1}. [${line.itemType}] ${line.name}${line.sku ? ` (${line.sku})` : ''} qty=${line.quantity} @ ${money(line.defaultPrice)}`
      ))
      sections.push(
        `Package ${full.name}${full.sku ? ` (${full.sku})` : ''} id=${full.id}`,
        full.categoryName ? `category: ${full.categoryName}` : null,
        full.description ? `desc: ${full.description}` : null,
        `items (${full.items.length}):`,
        ...lines,
      )
    }
    else if (packages.items.length) {
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

  const joined = sections.filter(Boolean).join('\n')
  if (/\bcost\b|\bmarkup\b/i.test(joined)) {
    // Safety net — catalog tools must never surface margin fields.
    return { ok: true, content: joined.replace(/\b(cost|markupPercent|markup)\b[^\n]*/gi, '').trim() }
  }
  return { ok: true, content: joined }
}

/** Exported for tests — pure helpers */
export const __entityToolTestUtils = {
  isUuid,
  clampLimit,
  parseEntityLookupArgs,
  parseSearchCatalogArgs,
}

export type { EntityLookupArgs, SearchCatalogArgs }
