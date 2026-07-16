import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { Address } from '../db/schema/customers'
import { customerContacts, customers } from '../db/schema/customers'
import { accountTypes, users } from '../db/schema/auth'
import { invoices } from '../db/schema/invoices'
import { vehicles } from '../db/schema/vehicles'
import { formatFieldText } from '#shared/format/prose-field'

export type CustomersServiceErrorCode = 'NOT_FOUND' | 'ALREADY_ARCHIVED' | 'NOT_ARCHIVED' | 'EMAIL_RESERVED_BY_STAFF'

export class CustomersServiceError extends Error {
  constructor(public readonly code: CustomersServiceErrorCode) {
    super(code)
  }
}

export interface CustomerInput {
  displayName: string
  accountKind: 'fleet' | 'individual'
  email?: string | null
  phone?: string | null
  billingAddress?: Address | null
  serviceAddress?: Address | null
  taxExempt?: boolean
  paymentTerms?: string
  notes?: string | null
}

async function assertCustomerEmailNotStaffReserved(db: Db, email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return

  const [existing] = await db
    .select({ accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.email, normalized))

  if (existing && existing.accountTypeKey !== 'customer') {
    throw new CustomersServiceError('EMAIL_RESERVED_BY_STAFF')
  }
}

export async function createCustomer(db: Db, input: CustomerInput, createdBy: string) {
  await assertCustomerEmailNotStaffReserved(db, input.email)
  const displayName = formatFieldText(input.displayName.trim(), 'name')
  const [row] = await db.insert(customers).values({
    displayName,
    accountKind: input.accountKind,
    email: input.email ?? null,
    phone: input.phone ?? null,
    billingAddress: input.billingAddress ?? null,
    serviceAddress: input.serviceAddress ?? null,
    taxExempt: input.taxExempt ?? false,
    paymentTerms: input.paymentTerms ?? 'due_on_receipt',
    notes: input.notes ?? null,
    createdBy,
  }).returning()

  const accountEmail = input.email?.trim()
  if (accountEmail) {
    await addContact(db, row!.id, {
      name: displayName,
      email: accountEmail,
      phone: input.phone ?? null,
      isPrimary: true,
    })
  }

  return row!
}

export async function getCustomer(db: Db, id: string) {
  const [row] = await db.select().from(customers).where(eq(customers.id, id))
  if (!row) throw new CustomersServiceError('NOT_FOUND')
  return row
}

export async function updateCustomer(db: Db, id: string, patch: Partial<CustomerInput>) {
  const before = await getCustomer(db, id)

  if (patch.email !== undefined) {
    await assertCustomerEmailNotStaffReserved(db, patch.email)
  }

  const normalizedPatch = { ...patch }
  if (normalizedPatch.displayName !== undefined) {
    normalizedPatch.displayName = formatFieldText(normalizedPatch.displayName.trim(), 'name')
  }

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  const changedFields: string[] = []
  for (const [key, value] of Object.entries(normalizedPatch)) {
    if (value !== undefined && JSON.stringify(value) !== JSON.stringify(before[key as keyof typeof before])) {
      changes[key] = value
      changedFields.push(key)
    }
  }

  if (!changedFields.length) return { customer: before, before, changedFields }

  const [updated] = await db.update(customers)
    .set(changes)
    .where(eq(customers.id, id))
    .returning()

  await syncPrimaryContactFromAccount(db, id, updated!, changedFields)

  return { customer: updated!, before, changedFields }
}

/** Keep the primary contact aligned when individual account fields change in Edit account. */
async function syncPortalUserEmailFromAccount(
  db: Db,
  portalUserId: string,
  email: string,
) {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return

  const [linked] = await db
    .select({ id: users.id, email: users.email, accountTypeKey: accountTypes.key })
    .from(users)
    .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
    .where(eq(users.id, portalUserId))
  if (!linked || linked.accountTypeKey !== 'customer') return
  if (linked.email === normalized) return

  const [conflict] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized))
  if (conflict && conflict.id !== portalUserId) return

  await db.update(users)
    .set({ email: normalized, updatedAt: new Date() })
    .where(eq(users.id, portalUserId))
}

async function syncPrimaryContactFromAccount(
  db: Db,
  customerId: string,
  customer: typeof customers.$inferSelect,
  changedFields: string[],
) {
  const syncFields = ['displayName', 'email', 'phone'] as const
  if (!changedFields.some(field => syncFields.includes(field as typeof syncFields[number]))) return

  const contacts = await listContacts(db, customerId)
  const primary = contacts.find(c => c.isPrimary) ?? contacts[0]
  if (!primary) {
    if (customer.email) {
      const created = await addContact(db, customerId, {
        name: customer.displayName,
        email: customer.email,
        phone: customer.phone,
        isPrimary: true,
      })
      if (created.portalUserId) {
        await syncPortalUserEmailFromAccount(db, created.portalUserId, customer.email)
      }
    }
    return
  }

  const patch: Partial<ContactInput> = {}
  if (changedFields.includes('email')) patch.email = customer.email
  if (customer.accountKind === 'individual') {
    if (changedFields.includes('displayName')) patch.name = customer.displayName
    if (changedFields.includes('phone')) patch.phone = customer.phone
  }
  if (Object.keys(patch).length) {
    await updateContact(db, customerId, primary.id, patch)
  }
  if (changedFields.includes('email') && customer.email && primary.portalUserId) {
    await syncPortalUserEmailFromAccount(db, primary.portalUserId, customer.email)
  }
}

export async function archiveCustomer(db: Db, id: string) {
  const before = await getCustomer(db, id)
  if (before.archivedAt) throw new CustomersServiceError('ALREADY_ARCHIVED')
  const [row] = await db.update(customers)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning()
  return row!
}

export async function restoreCustomer(db: Db, id: string) {
  const before = await getCustomer(db, id)
  if (!before.archivedAt) throw new CustomersServiceError('NOT_ARCHIVED')
  const [row] = await db.update(customers)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(customers.id, id))
    .returning()
  return row!
}

export interface ListCustomersFilter {
  /** Matches name, email, phone, contact name/email, vehicle bus #/VIN/plate. Invoice # search lands with invoices. */
  q?: string
  kind?: 'fleet' | 'individual'
  portal?: boolean
  includeArchived?: boolean
  sort?: 'name-asc' | 'name-desc' | 'newest'
  page: number
  pageSize: number
}

export async function listCustomers(db: Db, filter: ListCustomersFilter) {
  const conditions = []

  if (!filter.includeArchived) conditions.push(isNull(customers.archivedAt))
  if (filter.kind) conditions.push(eq(customers.accountKind, filter.kind))
  if (filter.portal !== undefined) conditions.push(eq(customers.portalEnabled, filter.portal))

  if (filter.q) {
    const term = `%${filter.q}%`
    conditions.push(or(
      ilike(customers.displayName, term),
      ilike(customers.email, term),
      ilike(customers.phone, term),
      exists(
        db.select({ one: sql`1` }).from(customerContacts).where(and(
          eq(customerContacts.customerId, customers.id),
          or(
            ilike(customerContacts.name, term),
            ilike(customerContacts.email, term),
            ilike(customerContacts.phone, term),
          ),
        )),
      ),
      // Find accounts by fleet unit — bus #, VIN, or plate (SPEC §6.1 search)
      exists(
        db.select({ one: sql`1` }).from(vehicles).where(and(
          eq(vehicles.customerId, customers.id),
          or(
            ilike(vehicles.busNumber, term),
            ilike(vehicles.vin, term),
            ilike(vehicles.plate, term),
          ),
        )),
      ),
    ))
  }

  const where = conditions.length ? and(...conditions) : undefined
  const orderBy = filter.sort === 'name-desc'
    ? desc(customers.displayName)
    : filter.sort === 'newest'
      ? desc(customers.createdAt)
      : asc(customers.displayName)

  const rows = await db.select().from(customers)
    .where(where)
    .orderBy(orderBy)
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize)

  const [total] = await db.select({ value: count() }).from(customers).where(where)

  // Primary contact per page of customers — no blobs, cheap join
  const ids = rows.map(r => r.id)
  await relinkOrphanInvoicesByName(db, rows.map(r => ({ id: r.id, displayName: r.displayName })))

  const contacts = ids.length
    ? await db.select().from(customerContacts)
        .where(and(
          inArray(customerContacts.customerId, ids),
          isNull(customerContacts.archivedAt),
        ))
    : []

  const byCustomer = new Map<string, typeof contacts>()
  for (const c of contacts) {
    const list = byCustomer.get(c.customerId) ?? []
    list.push(c)
    byCustomer.set(c.customerId, list)
  }

  const vehicleCounts = ids.length
    ? await db.select({ customerId: vehicles.customerId, value: count() })
        .from(vehicles)
        .where(and(inArray(vehicles.customerId, ids), isNull(vehicles.archivedAt)))
        .groupBy(vehicles.customerId)
    : []
  const vehiclesByCustomer = new Map(vehicleCounts.map(v => [v.customerId, Number(v.value)]))

  // Invoice totals for the page — open = sent/approved with balance due > 0 (same rule as invoice KPIs).
  const invoiceStats = ids.length
    ? await db.select({
        customerId: invoices.customerId,
        invoiceCount: count(),
        openInvoiceCount: sql<number>`count(*) filter (
          where ${invoices.status} in ('sent', 'approved')
            and ${invoices.balanceDue} > 0
        )`,
        openBalance: sql<string>`coalesce(sum(${invoices.balanceDue}) filter (
          where ${invoices.status} in ('sent', 'approved')
            and ${invoices.balanceDue} > 0
        ), 0)`,
        lifetimeBilled: sql<string>`coalesce(sum(${invoices.total}) filter (
          where ${invoices.status} <> 'void'
        ), 0)`,
      })
        .from(invoices)
        .where(and(
          inArray(invoices.customerId, ids),
          isNull(invoices.archivedAt),
        ))
        .groupBy(invoices.customerId)
    : []
  const invoicesByCustomer = new Map(invoiceStats.map(row => [row.customerId!, {
    invoiceCount: Number(row.invoiceCount ?? 0),
    openInvoiceCount: Number(row.openInvoiceCount ?? 0),
    openBalance: String(row.openBalance ?? '0'),
    lifetimeBilled: String(row.lifetimeBilled ?? '0'),
  }]))

  return {
    items: rows.map((r) => {
      const list = byCustomer.get(r.id) ?? []
      const primary = list.find(c => c.isPrimary) ?? list[0] ?? null
      const inv = invoicesByCustomer.get(r.id)
      return {
        ...r,
        primaryContact: primary ? { name: primary.name, email: primary.email, phone: primary.phone } : null,
        contactCount: list.length,
        vehicleCount: vehiclesByCustomer.get(r.id) ?? 0,
        invoiceCount: inv?.invoiceCount ?? 0,
        openInvoiceCount: inv?.openInvoiceCount ?? 0,
        openBalance: inv?.openBalance ?? '0',
        lifetimeBilled: inv?.lifetimeBilled ?? '0',
      }
    }),
    total: total!.value,
    page: filter.page,
    pageSize: filter.pageSize,
  }
}

/** Attach orphan imported invoices (null customer_id) to matching customers by snapshot name. */
async function relinkOrphanInvoicesByName(
  db: Db,
  customerRows: Array<{ id: string, displayName: string }>,
) {
  for (const customer of customerRows) {
    const name = customer.displayName.trim()
    if (!name) continue
    await db.execute(sql`
      UPDATE invoices
      SET customer_id = ${customer.id}, updated_at = now()
      WHERE customer_id IS NULL
        AND archived_at IS NULL
        AND lower(coalesce(customer_snapshot->>'displayName', '')) = lower(${name})
    `)
  }
}

/** Billing summary for a single customer detail page. */
export async function getCustomerBillingSummary(db: Db, customerId: string) {
  const customer = await getCustomer(db, customerId)
  await relinkOrphanInvoicesByName(db, [{ id: customer.id, displayName: customer.displayName }])

  const [row] = await db.select({
    invoiceCount: count(),
    openInvoiceCount: sql<number>`count(*) filter (
      where ${invoices.status} in ('sent', 'approved')
        and ${invoices.balanceDue} > 0
    )`,
    openBalance: sql<string>`coalesce(sum(${invoices.balanceDue}) filter (
      where ${invoices.status} in ('sent', 'approved')
        and ${invoices.balanceDue} > 0
    ), 0)`,
    lifetimeBilled: sql<string>`coalesce(sum(${invoices.total}) filter (
      where ${invoices.status} <> 'void'
    ), 0)`,
  })
    .from(invoices)
    .where(and(eq(invoices.customerId, customerId), isNull(invoices.archivedAt)))

  return {
    invoiceCount: Number(row?.invoiceCount ?? 0),
    openInvoiceCount: Number(row?.openInvoiceCount ?? 0),
    openBalance: String(row?.openBalance ?? '0'),
    lifetimeBilled: String(row?.lifetimeBilled ?? '0'),
  }
}

export async function listContacts(db: Db, customerId: string) {
  await getCustomer(db, customerId)
  return db.select().from(customerContacts)
    .where(and(eq(customerContacts.customerId, customerId), isNull(customerContacts.archivedAt)))
    .orderBy(desc(customerContacts.isPrimary), asc(customerContacts.name))
}

export interface ContactInput {
  name: string
  email?: string | null
  phone?: string | null
  title?: string | null
  isPrimary?: boolean
  isBilling?: boolean
}

export async function addContact(db: Db, customerId: string, input: ContactInput) {
  await getCustomer(db, customerId)

  return db.transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.update(customerContacts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(customerContacts.customerId, customerId))
    }
    const [row] = await tx.insert(customerContacts).values({
      customerId,
      name: input.name.trim(),
      email: input.email ?? null,
      phone: input.phone ?? null,
      title: input.title ?? null,
      isPrimary: input.isPrimary ?? false,
      isBilling: input.isBilling ?? false,
    }).returning()
    return row!
  })
}

export async function updateContact(db: Db, customerId: string, contactId: string, patch: Partial<ContactInput>) {
  const [before] = await db.select().from(customerContacts)
    .where(and(eq(customerContacts.id, contactId), eq(customerContacts.customerId, customerId)))
  if (!before) throw new CustomersServiceError('NOT_FOUND')

  return db.transaction(async (tx) => {
    if (patch.isPrimary) {
      await tx.update(customerContacts)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(eq(customerContacts.customerId, customerId))
    }
    const [row] = await tx.update(customerContacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(customerContacts.id, contactId))
      .returning()
    return { contact: row!, before }
  })
}

export async function archiveContact(db: Db, customerId: string, contactId: string) {
  const [before] = await db.select().from(customerContacts)
    .where(and(eq(customerContacts.id, contactId), eq(customerContacts.customerId, customerId)))
  if (!before) throw new CustomersServiceError('NOT_FOUND')
  const [row] = await db.update(customerContacts)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(customerContacts.id, contactId))
    .returning()
  return row!
}
