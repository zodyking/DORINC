// Integration tests for staff/customer email collision guards + repair helper.
import { config } from 'dotenv'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { signup, verifyEmail } from '../../server/auth/auth.service'
import { accountTypes, users } from '../../server/db/schema/auth'
import { customerContacts, customers } from '../../server/db/schema/customers'
import { createCustomer } from '../../server/services/customers.service'
import {
  setPortalAccess,
} from '../../server/services/portal-access.service'
import {
  diagnoseStaffEmailCollisions,
  repairStaffEmailCollision,
} from '../../server/services/staff-email-collision.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const emailDomain = `collision-${stamp}.dorinc.test`
const staffEmail = `staff@${emailDomain}`

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

let staffUserId = ''
let customerId = ''

afterAll(async () => {
  if (customerId) await db.delete(customers).where(eq(customers.id, customerId))
  await db.delete(users).where(like(users.email, `%@${emailDomain}`))
  await pool.end()
})

describe('staff / customer email collision', () => {
  it('blocks portal enable when customer email matches a staff account', async () => {
    const { user, verificationToken } = await signup(db, {
      name: 'Collision Staff',
      email: staffEmail,
      password: 'a-long-password-123',
      requestedAccountType: 'accountant',
    })
    staffUserId = user.id
    await verifyEmail(db, verificationToken)
    await db.update(users).set({ approvedAt: new Date() }).where(eq(users.id, user.id))

    const customer = await createCustomer(db, {
      displayName: `Collision Customer ${stamp}`,
      accountKind: 'individual',
      email: `other@${emailDomain}`,
    }, ACTOR)
    customerId = customer.id

    await db.update(customers)
      .set({ email: staffEmail, updatedAt: new Date() })
      .where(eq(customers.id, customerId))

    await expect(setPortalAccess(db, customerId, true, ACTOR)).rejects.toMatchObject({ code: 'EMAIL_IN_USE' })
  })

  it('blocks creating a customer with a staff-reserved email', async () => {
    await expect(createCustomer(db, {
      displayName: `Blocked ${stamp}`,
      accountKind: 'individual',
      email: staffEmail,
    }, ACTOR)).rejects.toMatchObject({ code: 'EMAIL_RESERVED_BY_STAFF' })
  })

  it('repairs a hijacked Super Admin user and recreates the portal user', async () => {
    const [superAdminType] = await db.select({ id: accountTypes.id }).from(accountTypes).where(eq(accountTypes.key, 'super_admin'))
    expect(superAdminType).toBeTruthy()

    await db.update(customers)
      .set({ portalEnabled: true, updatedAt: new Date() })
      .where(eq(customers.id, customerId))

    await db.update(users)
      .set({
        accountTypeId: superAdminType!.id,
        customerId: customerId,
        username: 'hijacked',
        updatedAt: new Date(),
      })
      .where(eq(users.id, staffUserId))

    const [contact] = await db.select().from(customerContacts).where(eq(customerContacts.customerId, customerId))
    await db.update(customerContacts)
      .set({ portalUserId: staffUserId, updatedAt: new Date() })
      .where(eq(customerContacts.id, contact!.id))

    const diagnosis = await diagnoseStaffEmailCollisions(db)
    expect(diagnosis.hijackedContacts.some(row => row.portalUserId === staffUserId)).toBe(true)

    const repaired = await repairStaffEmailCollision(db, {
      staffEmail,
      newPassword: 'repaired-password-1234',
    })

    expect(repaired.superAdminId).toBe(staffUserId)

    const [restoredStaff] = await db.select().from(users).where(eq(users.id, staffUserId))
    expect(restoredStaff?.email).toBe(staffEmail)
    expect(restoredStaff?.customerId).toBeNull()
    expect(restoredStaff?.username).toBeNull()

    const [updatedContact] = await db.select().from(customerContacts).where(eq(customerContacts.customerId, customerId))
    expect(updatedContact?.portalUserId).not.toBe(staffUserId)

    const [portalUser] = await db
      .select({ id: users.id, accountTypeKey: accountTypes.key })
      .from(users)
      .innerJoin(accountTypes, eq(users.accountTypeId, accountTypes.id))
      .where(eq(users.customerId, customerId))

    expect(portalUser?.accountTypeKey).toBe('customer')
    expect(portalUser?.id).not.toBe(staffUserId)
  })
})
