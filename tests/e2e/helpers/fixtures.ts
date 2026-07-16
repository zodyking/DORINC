import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'
import { eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { signup, verifyEmail } from '../../../server/auth/auth.service'
import { accountTypes, users } from '../../../server/db/schema/auth'
import { approveUser } from '../../../server/services/users.service'
import { createCustomer } from '../../../server/services/customers.service'
import { createVehicle } from '../../../server/services/vehicles.service'
import { createInvoiceDraft } from '../../../server/services/invoices.service'
import { sendAndDeliverInvoice } from '../../helpers/invoice-send'
import { createServiceLog } from '../../../server/services/service-logs.service'
import { createPortalUser } from '../../../server/services/portal.service'
import { createEstimate, sendEstimate } from '../../../server/services/estimates.service'
import { hashPassword } from '../../../server/auth/password'
import { rateLimitEvents } from '../../../server/db/schema/rate-limits'

config()

export const E2E_PASSWORD = 'e2e-test-password-123'
const FAKE_ADMIN = '00000000-0000-0000-0000-000000000000'
const FIXTURE_FILE = join(process.cwd(), 'tests/e2e/.fixture-cache.json')

export interface E2EFixtures {
  stamp: number
  staffEmail: string
  portalEmail: string
  portalUsername: string
  customerId: string
  vehicleId: string
  invoiceId: string
  editorInvoiceId: string
  serviceLogId: string
  estimateId: string
  pendingUserId: string
}

let pool: Pool | null = null
let db: ReturnType<typeof drizzle> | null = null

function getDb() {
  if (!db) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
    db = drizzle({ client: pool })
  }
  return db
}

function readCachedFixtures(): E2EFixtures | null {
  if (!existsSync(FIXTURE_FILE)) return null
  try {
    return JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as E2EFixtures
  }
  catch {
    return null
  }
}

function writeCachedFixtures(fixtures: E2EFixtures) {
  mkdirSync(join(process.cwd(), 'tests/e2e'), { recursive: true })
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixtures, null, 2))
}

async function promoteToSuperAdmin(userId: string) {
  const database = getDb()
  const [typeRow] = await database.select().from(accountTypes).where(eq(accountTypes.key, 'super_admin'))
  if (!typeRow) throw new Error('super_admin account type missing — run db:seed')
  await database.update(users).set({ accountTypeId: typeRow.id, approvedAt: new Date() }).where(eq(users.id, userId))
}

export async function ensureE2EFixtures(): Promise<E2EFixtures> {
  const cached = readCachedFixtures()
  if (cached?.portalUsername) return cached

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for Playwright E2E fixture seeding')
  }

  const stamp = Date.now()
  const database = getDb()
  const staffEmail = `e2e-staff-${stamp}@test.dorinc.local`
  const portalEmail = `e2e-portal-${stamp}@test.dorinc.local`

  const { user: staffUser, verificationToken } = await signup(database, {
    name: 'E2E Super Admin',
    email: staffEmail,
    password: E2E_PASSWORD,
    requestedAccountType: 'accountant',
  })
  await verifyEmail(database, verificationToken)
  await approveUser(database, { userId: staffUser.id, approvedBy: FAKE_ADMIN, accountTypeKey: 'accountant' })
  await promoteToSuperAdmin(staffUser.id)

  const { user: pendingUser, verificationToken: pendingToken } = await signup(database, {
    name: 'E2E Pending User',
    email: `e2e-pending-${stamp}@test.dorinc.local`,
    password: E2E_PASSWORD,
    requestedAccountType: 'mechanic',
  })
  await verifyEmail(database, pendingToken)

  const customer = await createCustomer(database, {
    displayName: `E2E Customer ${stamp}`,
    accountKind: 'fleet',
    paymentTerms: 'net_30',
  }, staffUser.id)

  const vehicle = await createVehicle(database, {
    customerId: customer.id,
    unitType: 'truck',
    busNumber: `E2E-${stamp}`,
    make: 'Freightliner',
    model: 'Cascadia',
    year: 2019,
  }, staffUser.id)

  const invoice = await createInvoiceDraft(database, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    invoiceDate: '2026-07-01',
    creationSource: 'blank',
  }, staffUser.id)

  const editorInvoice = await createInvoiceDraft(database, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    invoiceDate: '2026-07-01',
    creationSource: 'blank',
  }, staffUser.id)

  const serviceLog = await createServiceLog(database, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    serviceDate: '2026-07-02',
    odometerReading: '125000',
    complaint: 'E2E brake inspection',
    internalNotes: 'Inspected front pads',
  }, staffUser.id)

  const estimate = await createEstimate(database, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    estimateDate: '2026-07-03',
    validUntil: '2026-08-03',
    creationSource: 'blank',
  }, staffUser.id)

  await sendAndDeliverInvoice(database, pool!, invoice.id, staffUser.id, 'super_admin')
  await sendEstimate(database, estimate.id, staffUser.id)

  const portalUser = await createPortalUser(database, {
    customerId: customer.id,
    name: 'E2E Portal User',
    email: portalEmail,
    passwordHash: await hashPassword(E2E_PASSWORD),
  })

  const fixtures: E2EFixtures = {
    stamp,
    staffEmail,
    portalEmail,
    portalUsername: portalUser.username!,
    customerId: customer.id,
    vehicleId: vehicle.id,
    invoiceId: invoice.id,
    editorInvoiceId: editorInvoice.id,
    serviceLogId: serviceLog.id,
    estimateId: estimate.id,
    pendingUserId: pendingUser.id,
  }

  writeCachedFixtures(fixtures)
  return fixtures
}

async function clearLoginRateLimits() {
  if (!process.env.DATABASE_URL) return
  const database = getDb()
  await database.delete(rateLimitEvents)
}

export async function loginViaApi(
  baseURL: string,
  identifier: string,
  password: string,
  portal: 'customer' | 'staff' = 'staff',
) {
  const cacheKey = `${baseURL}:${portal}:${identifier}`
  const cached = sessionCookieCache.get(cacheKey)
  if (cached) return cached

  async function attemptLogin() {
    const body = portal === 'customer'
      ? { username: identifier, password, portal }
      : { email: identifier, password, portal }
    return fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  let res = await attemptLogin()
  if (res.status === 429) {
    await clearLoginRateLimits()
    res = await attemptLogin()
  }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Login failed for ${identifier}: ${res.status} ${body}`)
  }

  const setCookie = res.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/dorinc_session=([^;]+)/)
  if (!match) throw new Error('Session cookie missing from login response')

  const cookie = {
    name: 'dorinc_session',
    value: match[1]!,
    domain: new URL(baseURL).hostname,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax' as const,
  }
  sessionCookieCache.set(cacheKey, cookie)
  return cookie
}

const sessionCookieCache = new Map<string, {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  sameSite: 'Lax'
}>()

export function clearE2ESessionCache() {
  sessionCookieCache.clear()
}

export async function cleanupE2EFixtures() {
  const cached = readCachedFixtures()
  if (!cached || !process.env.DATABASE_URL) return

  const database = getDb()

  const { customers } = await import('../../../server/db/schema/customers')
  const { vehicles } = await import('../../../server/db/schema/vehicles')
  const { invoices, invoiceLineItems } = await import('../../../server/db/schema/invoices')
  const { serviceLogs } = await import('../../../server/db/schema/service-logs')
  const { estimates, estimateLineItems } = await import('../../../server/db/schema/estimates')

  await database.delete(estimateLineItems).where(eq(estimateLineItems.estimateId, cached.estimateId))
  await database.delete(estimates).where(eq(estimates.id, cached.estimateId))
  await database.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, cached.invoiceId))
  await database.delete(invoices).where(eq(invoices.id, cached.invoiceId))
  if (cached.editorInvoiceId) {
    await database.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, cached.editorInvoiceId))
    await database.delete(invoices).where(eq(invoices.id, cached.editorInvoiceId))
  }
  await database.delete(serviceLogs).where(eq(serviceLogs.id, cached.serviceLogId))
  await database.delete(users).where(like(users.email, `e2e-%${cached.stamp}@test.dorinc.local`))
  await database.delete(vehicles).where(eq(vehicles.id, cached.vehicleId))
  await database.delete(customers).where(eq(customers.id, cached.customerId))

  if (existsSync(FIXTURE_FILE)) unlinkSync(FIXTURE_FILE)

  if (pool) {
    await pool.end()
    pool = null
    db = null
  }
}
