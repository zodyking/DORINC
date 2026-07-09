// Integration tests for customers CRUD/archive/search + contacts (P1-07, P1-09).
import { config } from 'dotenv'
import { like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  addContact,
  archiveContact,
  archiveCustomer,
  createCustomer,
  CustomersServiceError,
  getCustomer,
  listContacts,
  listCustomers,
  restoreCustomer,
  updateContact,
  updateCustomer,
} from '../../server/services/customers.service'
import { customers } from '../../server/db/schema/customers'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const nameFor = (tag: string) => `CustTest-${stamp} ${tag}`
const MISSING_ID = '00000000-0000-0000-0000-000000000000'

// created_by must reference a real user — use any existing row
const { users } = await import('../../server/db/schema/auth')
const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const CREATOR = anyUser!.id

afterAll(async () => {
  await db.delete(customers).where(like(customers.displayName, `CustTest-${stamp}%`))
  await pool.end()
})

async function makeCustomer(tag: string, extra: Record<string, unknown> = {}) {
  return createCustomer(db, {
    displayName: nameFor(tag),
    accountKind: 'fleet',
    email: `${tag}-${stamp}@custtest.dorinc.local`,
    ...extra,
  }, CREATOR)
}

describe('P1-07 customers CRUD + archive + search', () => {
  it('creates and reads a customer', async () => {
    const created = await makeCustomer('create', { paymentTerms: 'net_30', taxExempt: true })
    const read = await getCustomer(db, created.id)
    expect(read.displayName).toBe(nameFor('create'))
    expect(read.paymentTerms).toBe('net_30')
    expect(read.taxExempt).toBe(true)
    expect(read.archivedAt).toBeNull()
  })

  it('updates fields and reports changed fields', async () => {
    const c = await makeCustomer('update')
    const { changedFields, customer } = await updateCustomer(db, c.id, {
      phone: '(302) 555-0101',
      notes: 'Prefers ACH',
    })
    expect(changedFields.sort()).toEqual(['notes', 'phone'])
    expect(customer.phone).toBe('(302) 555-0101')

    const noop = await updateCustomer(db, c.id, { phone: '(302) 555-0101' })
    expect(noop.changedFields).toEqual([])
  })

  it('archives and restores; archived hidden from default list', async () => {
    const c = await makeCustomer('archive')
    await archiveCustomer(db, c.id)
    await expect(archiveCustomer(db, c.id)).rejects.toThrow('ALREADY_ARCHIVED')

    const visible = await listCustomers(db, { q: nameFor('archive'), page: 1, pageSize: 10 })
    expect(visible.items).toHaveLength(0)

    const withArchived = await listCustomers(db, {
      q: nameFor('archive'), includeArchived: true, page: 1, pageSize: 10,
    })
    expect(withArchived.items).toHaveLength(1)

    await restoreCustomer(db, c.id)
    await expect(restoreCustomer(db, c.id)).rejects.toThrow('NOT_ARCHIVED')
    const restored = await listCustomers(db, { q: nameFor('archive'), page: 1, pageSize: 10 })
    expect(restored.items).toHaveLength(1)
  })

  it('searches by name, email and contact name', async () => {
    const c = await makeCustomer('search')
    await addContact(db, c.id, { name: `Zebulon-${stamp} Quirk`, email: `zq-${stamp}@x.dorinc.local` })

    const byName = await listCustomers(db, { q: nameFor('search'), page: 1, pageSize: 10 })
    expect(byName.items.map(i => i.id)).toContain(c.id)

    const byEmail = await listCustomers(db, { q: `search-${stamp}@custtest`, page: 1, pageSize: 10 })
    expect(byEmail.items.map(i => i.id)).toContain(c.id)

    const byContact = await listCustomers(db, { q: `Zebulon-${stamp}`, page: 1, pageSize: 10 })
    expect(byContact.items.map(i => i.id)).toContain(c.id)
  })

  it('throws NOT_FOUND for missing ids', async () => {
    await expect(getCustomer(db, MISSING_ID)).rejects.toThrow(CustomersServiceError)
  })
})

describe('P1-09 customer contacts', () => {
  it('adds contacts and keeps a single primary', async () => {
    const c = await makeCustomer('contacts')
    const first = await addContact(db, c.id, { name: 'First Contact', isPrimary: true })
    expect(first.isPrimary).toBe(true)

    const second = await addContact(db, c.id, { name: 'Second Contact', isPrimary: true, isBilling: true })
    expect(second.isPrimary).toBe(true)
    expect(second.isBilling).toBe(true)

    const contacts = await listContacts(db, c.id)
    const primaries = contacts.filter(x => x.isPrimary)
    expect(primaries).toHaveLength(1)
    expect(primaries[0]!.name).toBe('Second Contact')
  })

  it('updates and archives contacts', async () => {
    const c = await makeCustomer('contacts2')
    const contact = await addContact(db, c.id, { name: 'Temp Contact' })

    const { contact: updated } = await updateContact(db, c.id, contact.id, { phone: '555-1234' })
    expect(updated.phone).toBe('555-1234')

    await archiveContact(db, c.id, contact.id)
    const remaining = await listContacts(db, c.id)
    expect(remaining.find(x => x.id === contact.id)).toBeUndefined()

    await expect(updateContact(db, MISSING_ID, contact.id, {})).rejects.toThrow('NOT_FOUND')
  })
})
