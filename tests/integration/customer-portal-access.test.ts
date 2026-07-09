// Integration tests for portal credential email flow + mail worker (P2-01, P2-02).
import { config } from 'dotenv'
import { and, eq, like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
// @ts-expect-error plain-JS worker handler has no type declarations
import { processMailJobs } from '../../server/workers/handlers/mail.mjs'
import { users } from '../../server/db/schema/auth'
import { customerCredentialEmailLogs, customers } from '../../server/db/schema/customers'
import { workerJobs } from '../../server/db/schema/jobs'
import { addContact, createCustomer } from '../../server/services/customers.service'
import { getJob } from '../../server/services/jobs.service'
import {
  getPortalAccessSummary,
  listCredentialEmailHistory,
  sendPortalCredentials,
  setPortalAccess,
} from '../../server/services/portal-access.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const emailDomain = `portal-${stamp}.dorinc.test`

const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const STAFF = anyUser!.id

let customerId = ''
let contactEmail = ''

afterAll(async () => {
  if (customerId) {
    const logs = await db.select({ jobId: customerCredentialEmailLogs.workerJobId })
      .from(customerCredentialEmailLogs)
      .where(eq(customerCredentialEmailLogs.customerId, customerId))
    await db.delete(customers).where(eq(customers.id, customerId))
    for (const { jobId } of logs) {
      if (jobId) await pool.query('DELETE FROM worker_jobs WHERE id = $1', [jobId])
    }
    await db.delete(users).where(like(users.email, `%@${emailDomain}`))
  }
  await pool.end()
})

describe('P2-01 customer credential email flow', () => {
  it('enables portal from account email when no contact exists yet', async () => {
    const accountEmail = `account-only@${emailDomain}`
    const customer = await createCustomer(db, {
      displayName: `Hollis Logistics ${stamp}`,
      accountKind: 'fleet',
      email: accountEmail,
    }, STAFF)

    const enabled = await setPortalAccess(db, customer.id, true, STAFF)
    expect(enabled.customer.portalEnabled).toBe(true)

    const summary = await getPortalAccessSummary(db, customer.id)
    expect(summary.userCount).toBe(1)
    expect(summary.users[0]?.email).toBe(accountEmail)
    expect(summary.users[0]?.username).toBe('hollis')

    await db.delete(customers).where(eq(customers.id, customer.id))
    await db.delete(users).where(eq(users.email, accountEmail))
  })

  it('enables portal access, sends credentials, and logs every send', async () => {
    const customer = await createCustomer(db, {
      displayName: `Marren Farms ${stamp}`,
      accountKind: 'individual',
    }, STAFF)
    customerId = customer.id

    contactEmail = `contact@${emailDomain}`
    await addContact(db, customerId, {
      name: 'Portal Contact',
      email: contactEmail,
      isPrimary: true,
    })

    const enabled = await setPortalAccess(db, customerId, true, STAFF)
    expect(enabled.customer.portalEnabled).toBe(true)

    const first = await sendPortalCredentials(db, customerId, STAFF)
    expect(first.sendType).toBe('initial')
    expect(first.log.recipientEmail).toBe(contactEmail)
    expect(first.log.status).toBe('queued')
    expect(first.job.jobType).toBe('email_send')
    expect(first.username).toBe('marren')
    expect(first.job.payload).toMatchObject({
      text: expect.stringContaining('Username: marren'),
    })
    expect(String((first.job.payload as { text?: string }).text)).toMatch(
      /Temporary password: [A-Za-z]{8}[0-9][!@#$%&*]/,
    )

    const resend = await sendPortalCredentials(db, customerId, STAFF)
    expect(resend.sendType).toBe('resend')

    const history = await listCredentialEmailHistory(db, customerId)
    expect(history).toHaveLength(2)
    expect(history.every(h => h.recipientEmail === contactEmail)).toBe(true)

    const summary = await getPortalAccessSummary(db, customerId)
    expect(summary.portalEnabled).toBe(true)
    expect(summary.userCount).toBe(1)
    expect(summary.users[0]?.email).toBe(contactEmail)
  })
})

describe('P2-02 mail job worker', () => {
  it('processes queued email_send jobs and marks credential logs sent', async () => {
    // Drain any remaining queued sends from P2-01 before asserting on one row
    for (;;) {
      await db.update(workerJobs).set({ runAfter: new Date() }).where(and(eq(workerJobs.jobType, 'email_send'), eq(workerJobs.status, 'queued')))
      const batch = await processMailJobs(pool, 5)
      if (!batch.processed && !batch.failed) break
    }

    const history = await listCredentialEmailHistory(db, customerId)
    expect(history.some(h => h.status === 'sent')).toBe(true)
  })

  it('retries failed mail jobs with backoff before marking failed', async () => {
    const customer = await createCustomer(db, {
      displayName: `MailFail-${stamp}`,
      accountKind: 'individual',
    }, STAFF)
    const failEmail = `fail@${emailDomain}`
    await addContact(db, customer.id, { name: 'Fail Contact', email: failEmail, isPrimary: true })
    await setPortalAccess(db, customer.id, true, STAFF)
    const { job, log } = await sendPortalCredentials(db, customer.id, STAFF)

    await pool.query(
      `UPDATE worker_jobs SET status = 'done', finished_at = now()
       WHERE job_type = 'email_send' AND status = 'queued' AND id != $1`,
      [job.id],
    )

    await db.update(workerJobs).set({
      payload: { credentialLogId: log.id, to: '', subject: '', text: '' },
      runAfter: new Date(),
      maxAttempts: 2,
    }).where(eq(workerJobs.id, job.id))

    const first = await processMailJobs(pool, 1)
    expect(first.failed).toBe(1)
    const afterFirst = await getJob(db, job.id)
    expect(afterFirst?.status).toBe('queued')
    expect(afterFirst?.attempts).toBe(1)

    await db.update(workerJobs).set({ runAfter: new Date() }).where(eq(workerJobs.id, job.id))
    const second = await processMailJobs(pool, 1)
    expect(second.failed).toBe(1)
    const afterSecond = await getJob(db, job.id)
    expect(afterSecond?.status).toBe('failed')

    const [failedLog] = await db.select().from(customerCredentialEmailLogs).where(eq(customerCredentialEmailLogs.id, log.id))
    expect(failedLog?.status).toBe('failed')
    expect(failedLog?.errorMessage).toBeTruthy()

    await db.delete(customers).where(eq(customers.id, customer.id))
    await pool.query('DELETE FROM worker_jobs WHERE id = $1', [job.id])
    await db.delete(users).where(eq(users.email, failEmail))
  })
})
