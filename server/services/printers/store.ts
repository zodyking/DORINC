import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import {
  printerEvents,
  printerImageCatalog,
  printerJobs,
  printerMailBatches,
  printerSettings,
  printers,
} from '../../db/schema/printers'
import { decryptBuffer, encryptBuffer } from '../encryption.service'
import {
  PRINTER_PRIVATE_KEYS,
  PRINTER_SETTING_DEFAULTS,
  type PrinterJobStatus,
} from '../../../shared/printers'

const ENC_PREFIX = 'enc:'

export function printersDataDir(): string {
  const root = process.env.PRINTER_DATA_DIR?.trim() || join(process.cwd(), '.data', 'printers')
  mkdirSync(join(root, 'files'), { recursive: true })
  mkdirSync(join(root, 'tmp'), { recursive: true })
  mkdirSync(join(root, 'images'), { recursive: true })
  mkdirSync(join(root, 'tailscale'), { recursive: true })
  return root
}

function encryptSecret(value: string): string {
  if (!value) return ''
  return ENC_PREFIX + encryptBuffer(Buffer.from(value, 'utf8')).toString('base64')
}

function decryptSecret(raw: string): string {
  if (!raw) return ''
  if (!raw.startsWith(ENC_PREFIX)) return raw
  try {
    return decryptBuffer(Buffer.from(raw.slice(ENC_PREFIX.length), 'base64')).toString('utf8')
  }
  catch {
    return ''
  }
}

export async function ensurePrinterSettings(db: Db): Promise<void> {
  for (const [key, value] of Object.entries(PRINTER_SETTING_DEFAULTS)) {
    await db.insert(printerSettings)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoNothing()
  }
}

export async function printerSettingsMap(db: Db): Promise<Record<string, string>> {
  await ensurePrinterSettings(db)
  const rows = await db.select().from(printerSettings)
  const vals: Record<string, string> = { ...PRINTER_SETTING_DEFAULTS }
  for (const row of rows) vals[row.key] = row.value
  for (const name of PRINTER_PRIVATE_KEYS) {
    if (vals[name]) vals[name] = decryptSecret(vals[name]!)
  }
  return vals
}

export async function setPrinterSetting(db: Db, key: string, value: string): Promise<void> {
  const privateKey = (PRINTER_PRIVATE_KEYS as readonly string[]).includes(key)
  const stored = privateKey && value ? encryptSecret(value) : value
  await db.insert(printerSettings)
    .values({ key, value: stored, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: printerSettings.key,
      set: { value: stored, updatedAt: new Date() },
    })
}

export async function recordPrinterEvent(db: Db, level: string, msg: string): Promise<void> {
  const text = String(msg).slice(0, 600)
  const [last] = await db.select()
    .from(printerEvents)
    .orderBy(desc(printerEvents.createdAt))
    .limit(1)
  if (last && last.level === level && last.message === text) {
    await db.update(printerEvents)
      .set({ createdAt: new Date() })
      .where(eq(printerEvents.id, last.id))
    return
  }
  await db.insert(printerEvents).values({ level, message: text })
  await db.execute(sql`
    DELETE FROM printer_events
    WHERE id NOT IN (
      SELECT id FROM printer_events ORDER BY created_at DESC LIMIT 250
    )
  `)
}

export async function listPrinterRows(db: Db) {
  return db.select().from(printers).orderBy(printers.label)
}

export async function getPrinterRow(db: Db, queue: string) {
  const [row] = await db.select().from(printers).where(eq(printers.queue, queue)).limit(1)
  return row || null
}

export async function listPrinterJobRows(db: Db, limit = 100) {
  return db.select({
    id: printerJobs.id,
    dedupe: printerJobs.dedupe,
    createdAt: printerJobs.createdAt,
    source: printerJobs.source,
    sender: printerJobs.sender,
    filename: printerJobs.filename,
    queue: printerJobs.queue,
    pages: printerJobs.pages,
    copies: printerJobs.copies,
    sides: printerJobs.sides,
    status: printerJobs.status,
    cupsId: printerJobs.cupsId,
    filepath: printerJobs.filepath,
    error: printerJobs.error,
  }).from(printerJobs).orderBy(desc(printerJobs.createdAt)).limit(limit)
}

export async function listPrinterEventRows(db: Db, limit = 60) {
  return db.select().from(printerEvents).orderBy(desc(printerEvents.createdAt)).limit(limit)
}

export async function forgetTransientMailEvents(db: Db): Promise<void> {
  await db.execute(sql`
    DELETE FROM printer_events
    WHERE message LIKE 'Mail check failed: %'
      AND (
        message ILIKE '%timed out%'
        OR message ILIKE '%connection closed%'
        OR message ILIKE '%connection reset%'
        OR message ILIKE '%cannot read from timed out%'
        OR message ILIKE '%Mailbox watch stopped%'
      )
  `)
}

export async function rememberMailBatch(
  db: Db,
  prefix: string,
  sender: string,
  subject: string,
  messageId: string,
  queue: string,
): Promise<void> {
  await db.insert(printerMailBatches)
    .values({ prefix, sender, subject, messageId, queue, phase: 'new' })
    .onConflictDoUpdate({
      target: printerMailBatches.prefix,
      set: { sender, subject, messageId, queue, phase: 'new' },
    })
}

export async function setMailBatchPhase(db: Db, prefix: string, phase: string): Promise<void> {
  await db.update(printerMailBatches)
    .set({ phase })
    .where(eq(printerMailBatches.prefix, prefix))
}

export async function jobsWithPrefixStatus(db: Db, prefix: string, status: PrinterJobStatus) {
  return db.select({ id: printerJobs.id })
    .from(printerJobs)
    .where(and(sql`${printerJobs.dedupe} like ${`${prefix}:%`}`, eq(printerJobs.status, status)))
}

export async function getImageCatalogRow(db: Db, modelKey: string) {
  if (!modelKey) return null
  const [row] = await db.select().from(printerImageCatalog).where(eq(printerImageCatalog.modelKey, modelKey)).limit(1)
  return row || null
}

export async function upsertImageCatalog(
  db: Db,
  fields: {
    modelKey: string
    manufacturer?: string
    model?: string
    source?: string
    fingerprintId?: string
    localPath?: string
    confidence?: number
    license?: string
    attribution?: string
    sourcePage?: string
    checkedAt?: Date | null
    negativeUntil?: Date | null
    category?: string
    candidates?: string
  },
) {
  await db.insert(printerImageCatalog).values({
    modelKey: fields.modelKey,
    manufacturer: fields.manufacturer || '',
    model: fields.model || '',
    source: fields.source || '',
    fingerprintId: fields.fingerprintId || '',
    localPath: fields.localPath || '',
    confidence: fields.confidence || 0,
    license: fields.license || '',
    attribution: fields.attribution || '',
    sourcePage: fields.sourcePage || '',
    checkedAt: fields.checkedAt ?? new Date(),
    negativeUntil: fields.negativeUntil ?? null,
    category: fields.category || 'generic',
    candidates: fields.candidates || '[]',
  }).onConflictDoUpdate({
    target: printerImageCatalog.modelKey,
    set: {
      manufacturer: fields.manufacturer || '',
      model: fields.model || '',
      source: fields.source || '',
      fingerprintId: fields.fingerprintId || '',
      localPath: fields.localPath || '',
      confidence: fields.confidence || 0,
      license: fields.license || '',
      attribution: fields.attribution || '',
      sourcePage: fields.sourcePage || '',
      checkedAt: fields.checkedAt ?? new Date(),
      negativeUntil: fields.negativeUntil ?? null,
      category: fields.category || 'generic',
      candidates: fields.candidates || '[]',
    },
  })
  return getImageCatalogRow(db, fields.modelKey)
}

export async function clearImageCatalog(db: Db) {
  await db.delete(printerImageCatalog)
  await db.update(printers).set({
    imageKey: '',
    imageData: null,
    imageContentType: null,
    updatedAt: new Date(),
  }).where(eq(printers.imageMode, 'auto'))
}
