// Integration tests for AI extraction + invoice description (P2-13 / P2-14).
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain-JS worker handler
import { processAiJobs } from '../../server/workers/handlers/ai.mjs'
import { aiJobs, aiProviderSettings, aiSuggestions, aiUsageLogs } from '../../server/db/schema/ai'
import { auditLogs } from '../../server/db/schema/audit'
import { appFiles } from '../../server/db/schema/files'
import { invoiceLineItems, invoices } from '../../server/db/schema/invoices'
import { serviceLogs } from '../../server/db/schema/service-logs'
import { users } from '../../server/db/schema/auth'
import { workerJobs } from '../../server/db/schema/jobs'
import {
  enqueueInvoiceDescription,
  enqueueServiceLogExtraction,
  reviewAiSuggestion,
} from '../../server/services/ai-features.service'
import { updateAiProviderSettings } from '../../server/services/ai-provider.service'
import { uploadFile } from '../../server/services/files.service'
import { createCustomer } from '../../server/services/customers.service'
import { createVehicle } from '../../server/services/vehicles.service'
import { createServiceLog, getServiceLog } from '../../server/services/service-logs.service'
import { createInvoice, getInvoiceDetail, addInvoiceLineItem } from '../../server/services/invoices.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const testKey = `sk-or-test-${stamp}`
const encryptionKey = process.env.ENCRYPTION_MASTER_KEY ?? `test-ai-feat-${stamp}`

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

let actorId = ''
const createdJobIds: string[] = []
const createdWorkerJobIds: string[] = []
const createdSuggestionIds: string[] = []
const createdUsageIds: string[] = []
const createdFileIds: string[] = []
let serviceLogId = ''
let invoiceId = ''
let lineItemId = ''

const mockExtractionJson = {
  complaint: 'Oil leak at pan gasket',
  internalNotes: 'Replaced gasket and torqued to spec',
  draftLineItems: [{ description: 'Oil pan gasket', qty: '1', rate: '42.00', amount: '42.00' }],
}

const mockDescriptionJson = {
  description: 'Replaced failed outlet NOx sensor and completed ECM relearn procedure.',
}

beforeAll(async () => {
  process.env.ENCRYPTION_MASTER_KEY = encryptionKey
  const [actor] = await db.select({ id: users.id }).from(users).limit(1)
  actorId = actor!.id

  const customer = await createCustomer(db, {
    displayName: `AiFeat-${stamp} Fleet`,
    accountKind: 'fleet',
  }, actorId)

  const vehicle = await createVehicle(db, {
    customerId: customer.id,
    unitType: 'truck',
    busNumber: `AI-${stamp}`,
    make: 'Kenworth',
    model: 'T680',
    year: 2019,
  }, actorId)

  const log = await createServiceLog(db, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    serviceDate: '2026-07-07',
    complaint: 'Original complaint',
    internalNotes: 'Original notes',
  }, actorId)
  serviceLogId = log.id

  const file = await uploadFile(db, {
    ownerEntityType: 'service_log',
    ownerEntityId: serviceLogId,
    originalFilename: 'note.png',
    mimeType: 'image/png',
    data: PNG_BYTES,
  }, actorId)
  createdFileIds.push(file.id)

  const invoice = await createInvoice(db, {
    customerId: customer.id,
    vehicleId: vehicle.id,
    serviceLogId,
    invoiceDate: '2026-07-08',
  }, actorId)
  invoiceId = invoice.id
  await addInvoiceLineItem(db, invoiceId, {
    lineType: 'labor',
    description: 'nox sensor bad, replaced w/ OEM',
    quantity: '1.5',
    unitPrice: '145.00',
    sortOrder: 0,
  }, actorId)
  const full = await getInvoiceDetail(db, invoiceId)
  lineItemId = full.lineItems[0]!.id
})

async function ensureAiReady() {
  await updateAiProviderSettings(db, {
    apiKey: testKey,
    enabled: true,
    serviceLogExtractionEnabled: true,
    invoiceDescriptionEnabled: true,
  }, actorId)
}

afterAll(async () => {
  await db.delete(auditLogs).where(eq(auditLogs.entityId, serviceLogId))
  await db.delete(auditLogs).where(eq(auditLogs.entityId, invoiceId))

  if (createdUsageIds.length) {
    for (const id of createdUsageIds) {
      await db.delete(aiUsageLogs).where(eq(aiUsageLogs.id, id))
    }
  }
  if (createdJobIds.length) {
    for (const id of createdJobIds) {
      await db.delete(aiUsageLogs).where(eq(aiUsageLogs.aiJobId, id))
    }
  }
  if (createdSuggestionIds.length) {
    for (const id of createdSuggestionIds) {
      await db.delete(aiSuggestions).where(eq(aiSuggestions.id, id))
    }
  }
  if (createdJobIds.length) {
    for (const id of createdJobIds) {
      await db.delete(aiSuggestions).where(eq(aiSuggestions.aiJobId, id))
    }
  }
  if (createdWorkerJobIds.length) {
    for (const id of createdWorkerJobIds) {
      await db.update(aiJobs).set({ workerJobId: null }).where(eq(aiJobs.workerJobId, id))
      await db.delete(workerJobs).where(eq(workerJobs.id, id))
    }
  }
  if (createdJobIds.length) {
    for (const id of createdJobIds) {
      await db.delete(aiJobs).where(eq(aiJobs.id, id))
    }
  }
  for (const fid of createdFileIds) {
    await db.delete(appFiles).where(eq(appFiles.id, fid))
  }
  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoiceId))
  await db.delete(invoices).where(eq(invoices.id, invoiceId))
  await db.delete(serviceLogs).where(eq(serviceLogs.id, serviceLogId))
  await db.update(aiProviderSettings).set({ encryptedApiKey: null, enabled: false })
  await pool.end()
})

function trackFetchMock(content: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140, cost: 0.0012 },
    }),
  } as Response)
}

describe('P2-13 service log AI extraction', () => {
  it('queues extraction and worker creates a pending suggestion', async () => {
    await ensureAiReady()
    const fetchMock = trackFetchMock(mockExtractionJson)

    const { aiJob, workerJob } = await enqueueServiceLogExtraction(db, serviceLogId, actorId, createdFileIds[0])
    createdJobIds.push(aiJob.id)
    createdWorkerJobIds.push(workerJob.id)

    await pool.query(`UPDATE worker_jobs SET run_after = now() WHERE id = $1`, [workerJob.id])
    const result = await processAiJobs(pool)
    expect(result.processed).toBe(1)

    const { rows: suggestions } = await pool.query(
      `SELECT * FROM ai_suggestions WHERE ai_job_id = $1`,
      [aiJob.id],
    )
    expect(suggestions[0].status).toBe('pending')
    expect(suggestions[0].suggested_content.complaint).toBe(mockExtractionJson.complaint)
    createdSuggestionIds.push(suggestions[0].id)

    fetchMock.mockRestore()
  })

  it('accept applies extraction to service log and preserves audit trail via review', async () => {
    await ensureAiReady()
    const fetchMock = trackFetchMock(mockExtractionJson)
    const { aiJob, workerJob } = await enqueueServiceLogExtraction(db, serviceLogId, actorId, createdFileIds[0])
    createdJobIds.push(aiJob.id)
    createdWorkerJobIds.push(workerJob.id)
    await pool.query(`UPDATE worker_jobs SET run_after = now() WHERE id = $1`, [workerJob.id])
    await processAiJobs(pool)

    const { rows: suggestions } = await pool.query(
      `SELECT id FROM ai_suggestions WHERE ai_job_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [aiJob.id],
    )
    const suggestionId = suggestions[0].id as string
    createdSuggestionIds.push(suggestionId)

    const reviewed = await reviewAiSuggestion(db, suggestionId, { action: 'accept' }, actorId)
    expect(reviewed.status).toBe('accepted')

    const log = await getServiceLog(db, serviceLogId)
    expect(log.complaint).toBe(mockExtractionJson.complaint)
    expect(log.internalNotes).toBe(mockExtractionJson.internalNotes)
    expect(Array.isArray(log.draftLineItems)).toBe(true)

    fetchMock.mockRestore()
  })
})

describe('P2-14 invoice description AI writer', () => {
  it('queues description job and worker returns wording-only suggestion', async () => {
    await ensureAiReady()
    const fetchMock = trackFetchMock(mockDescriptionJson)

    const { aiJob, workerJob } = await enqueueInvoiceDescription(db, invoiceId, lineItemId, actorId)
    createdJobIds.push(aiJob.id)
    createdWorkerJobIds.push(workerJob.id)

    await pool.query(`UPDATE worker_jobs SET run_after = now() WHERE id = $1`, [workerJob.id])
    const result = await processAiJobs(pool)
    expect(result.processed).toBe(1)

    const { rows: suggestions } = await pool.query(
      `SELECT * FROM ai_suggestions WHERE ai_job_id = $1`,
      [aiJob.id],
    )
    const suggestion = suggestions[0]
    expect(suggestion.status).toBe('pending')
    expect(suggestion.original_content.description).toContain('nox sensor')
    expect(suggestion.suggested_content.description).toBe(mockDescriptionJson.description)
    createdSuggestionIds.push(suggestion.id)

    fetchMock.mockRestore()
  })

  it('accept updates line description only — qty and price unchanged', async () => {
    await ensureAiReady()
    const fetchMock = trackFetchMock(mockDescriptionJson)
    const before = await getInvoiceDetail(db, invoiceId)
    const lineBefore = before.lineItems.find(l => l.id === lineItemId)!
    const qty = lineBefore.quantity
    const price = lineBefore.unitPrice

    const { aiJob, workerJob } = await enqueueInvoiceDescription(db, invoiceId, lineItemId, actorId)
    createdJobIds.push(aiJob.id)
    createdWorkerJobIds.push(workerJob.id)
    await pool.query(`UPDATE worker_jobs SET run_after = now() WHERE id = $1`, [workerJob.id])
    await processAiJobs(pool)

    const { rows: suggestions } = await pool.query(
      `SELECT id FROM ai_suggestions WHERE ai_job_id = $1`,
      [aiJob.id],
    )
    const suggestionId = suggestions[0].id as string
    createdSuggestionIds.push(suggestionId)

    await reviewAiSuggestion(db, suggestionId, {
      action: 'accept',
      lineItemId,
    }, actorId)

    const after = await getInvoiceDetail(db, invoiceId)
    const lineAfter = after.lineItems.find(l => l.id === lineItemId)!
    expect(lineAfter.description).toBe(mockDescriptionJson.description)
    expect(lineAfter.quantity).toBe(qty)
    expect(lineAfter.unitPrice).toBe(price)

    fetchMock.mockRestore()
  })
})
