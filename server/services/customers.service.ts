import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, or, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import type { Address } from '../db/schema/customers'
import { customerContacts, customers } from '../db/schema/customers'
import { vehicles } from '../db/schema/vehicles'

export type CustomersServiceErrorCode = 'NOT_FOUND' | 'ALREADY_ARCHIVED' | 'NOT_ARCHIVED'

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

export async function createCustomer(db: Db, input: CustomerInput, createdBy: string) {
  const [row] = await db.insert(customers).values({
    displayName: input.displayName.trim(),
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
      name: input.displayName.trim(),
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

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  const changedFields: string[] = []
  for (const [key, value] of Object.entries(patch)) {
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

  return { customer: updated!, before, changedFields }
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
  const vehiclesByCustomer = new Map(vehicleCounts.map(v => [v.customerId, v.value]))

  return {
    items: rows.map((r) => {
      const list = byCustomer.get(r.id) ?? []
      const primary = list.find(c => c.isPrimary) ?? list[0] ?? null
      return {
        ...r,
        primaryContact: primary ? { name: primary.name, email: primary.email, phone: primary.phone } : null,
        contactCount: list.length,
        vehicleCount: vehiclesByCustomer.get(r.id) ?? 0,
      }
    }),
    total: total!.value,
    page: filter.page,
    pageSize: filter.pageSize,
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
