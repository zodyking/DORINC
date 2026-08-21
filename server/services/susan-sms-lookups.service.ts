import type { Db } from '../db/client'
import {
  extractInvoiceNumber,
  extractServiceLogNumber,
  inferInvoiceStatus,
  residualInvoiceSearchQuery,
} from '../../shared/susan-entity-query'
import {
  formatSusanSmsCatalogItem,
  formatSusanSmsChoiceList,
  formatSusanSmsCustomerCard,
  formatSusanSmsCustomerChoiceLabel,
  formatSusanSmsInvoiceCard,
  formatSusanSmsInvoiceChoiceLabel,
  formatSusanSmsServiceLogCard,
  formatSusanSmsServiceLogChoiceLabel,
  rankSmsNameMatch,
  withSmsMoreHint,
} from '../../shared/susan-sms-format'
import type { SusanSmsActionResult, SusanSmsMenuActionId, SusanSmsPickOption } from '../../shared/susan-sms-actions'
import {
  findInvoiceIdByNumber,
  getInvoiceDetail,
  InvoicesServiceError,
  listInvoices,
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
  listCatalogItems,
  listLaborRates,
  listPackages,
} from './catalog.service'
import {
  formatSusanPermissionDenial,
  loadSusanAuthByUserId,
  susanPermissionDecision,
  type SusanAuthContext,
} from './susan-auth.service'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value: string | undefined | null): value is string {
  return !!value && UUID_RE.test(value.trim())
}

function nowIso(): string {
  return new Date().toISOString()
}

function cityState(addr: { city?: string | null, state?: string | null } | null | undefined): string {
  if (!addr) return ''
  return [addr.city, addr.state].filter(Boolean).join(', ')
}

function deny(auth: SusanAuthContext, permission: Parameters<typeof susanPermissionDecision>[1]): SusanSmsActionResult {
  const decision = susanPermissionDecision(auth, permission)
  return {
    ok: false,
    content: formatSusanPermissionDenial(permission, decision)
      || `You need permission ${permission} for that.`,
    pendingAction: null,
  }
}

function pick(
  title: string,
  options: SusanSmsPickOption[],
  action: SusanSmsMenuActionId,
  data: Record<string, string> = {},
): SusanSmsActionResult {
  return {
    ok: true,
    content: formatSusanSmsChoiceList(title, options),
    pendingAction: {
      kind: 'wizard',
      action,
      step: 'pick',
      data,
      options,
      startedAt: nowIso(),
    },
  }
}

async function invoiceCard(db: Db, invoiceId: string): Promise<SusanSmsActionResult> {
  try {
    const inv = await getInvoiceDetail(db, invoiceId)
    return {
      ok: true,
      content: withSmsMoreHint(formatSusanSmsInvoiceCard(inv)),
      pendingAction: null,
    }
  }
  catch (err) {
    if (err instanceof InvoicesServiceError && err.code === 'NOT_FOUND') {
      return { ok: true, content: withSmsMoreHint('That invoice was not found.'), pendingAction: null }
    }
    throw err
  }
}

export async function lookupInvoiceForSms(
  db: Db,
  userId: string,
  queryRaw: string,
  explicitId?: string,
): Promise<SusanSmsActionResult> {
  const auth = await loadSusanAuthByUserId(db, userId)
  if (!auth) return { ok: false, content: 'Unable to resolve staff permissions.', pendingAction: null }
  const perm = susanPermissionDecision(auth, 'invoices.read.all')
  if (!perm.allowed) return deny(auth, 'invoices.read.all')

  if (isUuid(explicitId)) return invoiceCard(db, explicitId)

  const query = String(queryRaw || '').trim()
  const invoiceNumber = extractInvoiceNumber(query)
  if (invoiceNumber != null) {
    const id = await findInvoiceIdByNumber(db, invoiceNumber)
    if (!id) {
      return {
        ok: true,
        content: withSmsMoreHint(`No invoice found for INV-${String(invoiceNumber).padStart(6, '0')}. Try another number.`),
        pendingAction: null,
      }
    }
    return invoiceCard(db, id)
  }

  const status = inferInvoiceStatus(query)
  const residual = residualInvoiceSearchQuery(query)
  const search = residual || (!status ? query : '')

  if (status === 'unpaid' || status === 'outstanding' || status === 'overdue') {
    const listed = await listInvoices(db, {
      outstanding: status !== 'overdue',
      overdue: status === 'overdue',
      q: search || undefined,
      includeArchived: false,
      page: 1,
      pageSize: 5,
      sort: 'due_date',
    })
    if (!listed.items.length) {
      return {
        ok: true,
        content: withSmsMoreHint(status === 'overdue' ? 'No overdue invoices.' : 'No unpaid invoices.'),
        pendingAction: null,
      }
    }
    if (listed.items.length === 1) return invoiceCard(db, listed.items[0]!.id)
    return pick(
      status === 'overdue' ? 'Overdue invoices. Which one?' : 'Unpaid invoices. Which one?',
      listed.items.map((row, i) => ({
        n: i + 1,
        id: row.id,
        label: formatSusanSmsInvoiceChoiceLabel(row),
        extra: { name: row.invoiceNumberFormatted },
      })),
      'lookup_invoice',
    )
  }

  if (!query) {
    return { ok: true, content: 'Invoice number, customer name, or unpaid/overdue.' }
  }

  const listed = await listInvoices(db, {
    q: search || query,
    includeArchived: false,
    page: 1,
    pageSize: 5,
  })
  if (!listed.items.length) {
    return { ok: true, content: withSmsMoreHint(`No invoices matched “${query}”. Try another search.`) }
  }
  if (listed.items.length === 1) return invoiceCard(db, listed.items[0]!.id)
  return pick(
    `I found ${listed.items.length} invoices. Which one?`,
    listed.items.map((row, i) => ({
      n: i + 1,
      id: row.id,
      label: formatSusanSmsInvoiceChoiceLabel(row),
      extra: { name: row.invoiceNumberFormatted },
    })),
    'lookup_invoice',
  )
}

async function customerCard(db: Db, customerId: string): Promise<SusanSmsActionResult> {
  try {
    const customer = await getCustomer(db, customerId)
    const [contacts, billing] = await Promise.all([
      listContacts(db, customer.id),
      getCustomerBillingSummary(db, customer.id),
    ])
    const primary = contacts.find(c => c.isPrimary) ?? contacts[0]
    return {
      ok: true,
      content: withSmsMoreHint(formatSusanSmsCustomerCard({
        displayName: customer.displayName,
        accountKind: customer.accountKind,
        email: customer.email || primary?.email || null,
        phone: customer.phone || primary?.phone || null,
        cityState: cityState(customer.billingAddress) || cityState(customer.serviceAddress) || null,
        paymentTerms: customer.paymentTerms,
        openBalance: billing.openBalance,
        openInvoiceCount: billing.openInvoiceCount,
        invoiceCount: billing.invoiceCount,
      })),
      pendingAction: null,
    }
  }
  catch (err) {
    if (err instanceof CustomersServiceError && err.code === 'NOT_FOUND') {
      return { ok: true, content: withSmsMoreHint('That customer was not found.'), pendingAction: null }
    }
    throw err
  }
}

export async function lookupCustomerForSms(
  db: Db,
  userId: string,
  queryRaw: string,
  explicitId?: string,
): Promise<SusanSmsActionResult> {
  const auth = await loadSusanAuthByUserId(db, userId)
  if (!auth) return { ok: false, content: 'Unable to resolve staff permissions.', pendingAction: null }
  const perm = susanPermissionDecision(auth, 'customers.read.all')
  if (!perm.allowed) return deny(auth, 'customers.read.all')

  if (isUuid(explicitId)) return customerCard(db, explicitId)

  const query = String(queryRaw || '').trim()
  if (!query) {
    return { ok: true, content: 'Customer name, email, or phone. A partial name is enough.' }
  }

  const listed = await listCustomers(db, {
    q: query,
    includeArchived: false,
    page: 1,
    pageSize: 8,
  })

  const ranked = [...listed.items]
    .map(row => ({
      row,
      score: Math.max(
        rankSmsNameMatch(query, row.displayName),
        rankSmsNameMatch(query, row.email || ''),
        rankSmsNameMatch(query, row.primaryContact?.name || ''),
      ),
    }))
    .sort((a, b) => b.score - a.score || a.row.displayName.localeCompare(b.row.displayName))

  if (!ranked.length) {
    return { ok: true, content: withSmsMoreHint(`No customers matched “${query}”. Try another name.`) }
  }

  if (ranked.length === 1) {
    return customerCard(db, ranked[0]!.row.id)
  }

  return pick(
    ranked.length === 1
      ? 'Is this the customer?'
      : `Closest matches for “${query}”. Which one?`,
    ranked.map((hit, i) => ({
      n: i + 1,
      id: hit.row.id,
      label: formatSusanSmsCustomerChoiceLabel({
        displayName: hit.row.displayName,
        email: hit.row.email,
        accountKind: hit.row.accountKind,
      }),
      extra: { name: hit.row.displayName },
    })),
    'lookup_customer',
  )
}

async function serviceLogCard(db: Db, logId: string, ownOnly: boolean, actorId: string): Promise<SusanSmsActionResult> {
  try {
    const log = await getServiceLog(db, logId)
    if (ownOnly && log.submittedBy !== actorId) {
      return { ok: true, content: withSmsMoreHint('That service log was not found.'), pendingAction: null }
    }
    return {
      ok: true,
      content: withSmsMoreHint(formatSusanSmsServiceLogCard({
        logNumber: log.logNumber,
        status: log.status,
        customerName: log.customerName,
        serviceDate: log.serviceDate,
        complaint: log.complaint,
        invoiceNumberFormatted: null,
        vehicle: log.vehicle,
      })),
      pendingAction: null,
    }
  }
  catch (err) {
    if (err instanceof ServiceLogsServiceError && err.code === 'NOT_FOUND') {
      return { ok: true, content: withSmsMoreHint('That service log was not found.'), pendingAction: null }
    }
    throw err
  }
}

export async function lookupServiceLogForSms(
  db: Db,
  userId: string,
  queryRaw: string,
  explicitId?: string,
): Promise<SusanSmsActionResult> {
  const auth = await loadSusanAuthByUserId(db, userId)
  if (!auth) return { ok: false, content: 'Unable to resolve staff permissions.', pendingAction: null }
  const allDec = susanPermissionDecision(auth, 'service_logs.read.all')
  const ownDec = susanPermissionDecision(auth, 'service_logs.read.own')
  if (!allDec.allowed && !ownDec.allowed) return deny(auth, 'service_logs.read.all')
  const ownOnly = !allDec.allowed && ownDec.allowed

  if (isUuid(explicitId)) return serviceLogCard(db, explicitId, ownOnly, auth.user.id)

  const query = String(queryRaw || '').trim()
  const logNumber = extractServiceLogNumber(query)
  if (logNumber != null) {
    const id = await findServiceLogIdByNumber(db, logNumber)
    if (!id) {
      return {
        ok: true,
        content: withSmsMoreHint(`No service log found for SL-${String(logNumber).padStart(4, '0')}.`),
        pendingAction: null,
      }
    }
    return serviceLogCard(db, id, ownOnly, auth.user.id)
  }

  if (!query) {
    return { ok: true, content: 'Log number (SL-0713), customer, or bus/unit.' }
  }

  const listed = await listServiceLogs(db, {
    q: query,
    includeArchived: false,
    submittedBy: ownOnly ? auth.user.id : undefined,
    page: 1,
    pageSize: 5,
  })
  if (!listed.items.length) {
    return { ok: true, content: withSmsMoreHint(`No service logs matched “${query}”.`) }
  }
  if (listed.items.length === 1) return serviceLogCard(db, listed.items[0]!.id, ownOnly, auth.user.id)
  return pick(
    `I found ${listed.items.length} service logs. Which one?`,
    listed.items.map((row, i) => ({
      n: i + 1,
      id: row.id,
      label: formatSusanSmsServiceLogChoiceLabel(row),
      extra: { name: `SL-${String(row.logNumber).padStart(4, '0')}` },
    })),
    'lookup_service_log',
  )
}

export async function searchCatalogForSms(
  db: Db,
  userId: string,
  queryRaw: string,
): Promise<SusanSmsActionResult> {
  const auth = await loadSusanAuthByUserId(db, userId)
  if (!auth) return { ok: false, content: 'Unable to resolve staff permissions.', pendingAction: null }
  const perm = susanPermissionDecision(auth, 'catalog.read.all')
  if (!perm.allowed) return deny(auth, 'catalog.read.all')

  const query = String(queryRaw || '').trim()
  if (!query) {
    return { ok: true, content: 'Part name, labor, or SKU to search.' }
  }

  const [items, packages, rates] = await Promise.all([
    listCatalogItems(db, { q: query, includeArchived: false, page: 1, pageSize: 5 }),
    listPackages(db, { q: query, includeArchived: false, page: 1, pageSize: 3 }),
    listLaborRates(db, { q: query, includeArchived: false, page: 1, pageSize: 3 }),
  ])

  const blocks: string[] = []
  for (const item of items.items) {
    blocks.push(formatSusanSmsCatalogItem(item))
  }
  for (const pack of packages.items) {
    blocks.push(formatSusanSmsCatalogItem({
      name: pack.name,
      itemType: 'package',
      sku: pack.sku,
    }))
  }
  for (const rate of rates.items) {
    blocks.push(formatSusanSmsCatalogItem({
      name: rate.name,
      itemType: 'rate',
      sku: rate.sku,
      defaultPrice: rate.rate,
      uom: rate.uom || 'hr',
    }))
  }

  if (!blocks.length) {
    return { ok: true, content: withSmsMoreHint(`No catalog items matched “${query}”.`) }
  }

  const numbered = blocks.slice(0, 6).map((label, i) => `${i + 1}) ${label}`)
  return {
    ok: true,
    content: withSmsMoreHint(['Catalog matches', '', numbered.join('\n\n')].join('\n')),
    pendingAction: null,
  }
}
