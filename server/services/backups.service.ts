import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { desc, eq, and, gte, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { Db } from '../db/client'
import { backupRuns, backupSettings, type BackupRunStatus } from '../db/schema/backups'
import { backupRecoveryTests, type BackupRecoveryTestStatus } from '../db/schema/security'
import { decryptBuffer, encryptBuffer, sha256Hex } from './encryption.service'
import { writeAudit } from './audit.service'
import { getNotifyEmail, getSmtpConfig, getAppUrl } from './app-config.service'
import { getDatabaseUrl } from './runtime-config.service'
import { enqueueJob } from './jobs.service'
import { buildBackupNotificationEmail } from '../mail/templates/system'
import {
  getBackupIntegrationView,
  GoogleDriveBackupError,
  uploadEncryptedBackupToDrive,
} from './google-drive-backup.service'

export type BackupsServiceErrorCode = 'NOT_FOUND' | 'ALREADY_RUNNING' | 'DUMP_FAILED' | 'KEY_MISSING' | 'RESTORE_FAILED' | 'VERIFY_FAILED'

export class BackupsServiceError extends Error {
  constructor(public readonly code: BackupsServiceErrorCode) {
    super(code)
  }
}

export interface BackupActor {
  id: string
  name?: string
  email?: string
  accountType?: string
}

export interface BackupRunSummary {
  id: string
  filename: string
  status: BackupRunStatus
  trigger: string
  encryptedBytes: number
  sha256Checksum: string
  errorMessage: string | null
  driveFileId: string | null
  driveUploadedAt: Date | null
  createdBy: string | null
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
}

export interface BackupRecoveryTestSummary {
  id: string
  backupRunId: string
  status: BackupRecoveryTestStatus
  valid: boolean | null
  tocEntries: number | null
  errorMessage: string | null
  testedBy: string | null
  startedAt: Date | null
  finishedAt: Date | null
  createdAt: Date
}

export interface BackupSettingsView {
  id: string
  enabled: boolean
  scheduleCron: string | null
  retentionDaily: number
  retentionWeekly: number
  retentionMonthly: number
  storageMode: string
  notifyEmail: string | null
  updatedAt: Date
}

interface PgConn {
  host: string
  port: string
  user: string
  password: string
  database: string
}

function parseDatabaseUrl(url: string): PgConn {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  }
}

function defaultScheduleCron(): string {
  return process.env.BACKUP_SCHEDULE?.trim() || '0 2 * * *'
}

function defaultNotifyEmail(): string | null {
  return getNotifyEmail()
    || getSmtpConfig()?.from.replace(/.*<([^>]+)>.*/, '$1').trim()
    || null
}

/** Parse daily cron `minute hour * * *` — sufficient for nightly backups. */
export function isDailyCronDue(cron: string, now = new Date()): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 2) return false
  const minute = Number(parts[0])
  const hour = Number(parts[1])
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return false
  return now.getUTCHours() === hour && now.getUTCMinutes() === minute
}

export function formatScheduleLabel(cron: string | null | undefined): string {
  const value = cron?.trim() || defaultScheduleCron()
  const parts = value.split(/\s+/)
  if (parts.length >= 2) {
    const minute = Number(parts[0])
    const hour = Number(parts[1])
    if (Number.isInteger(minute) && Number.isInteger(hour)) {
      const h12 = hour % 12 || 12
      const ampm = hour < 12 ? 'AM' : 'PM'
      return `Nightly · ${h12}:${String(minute).padStart(2, '0')} ${ampm} UTC`
    }
  }
  return `Scheduled · ${value}`
}

function backupFilename(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    '_',
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join('')
  return `backup_devon_invoice_suite_${stamp}.dump.zst.enc`
}

async function runPgDump(conn: PgConn): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const args = [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '-h', conn.host,
      '-p', conn.port,
      '-U', conn.user,
      conn.database,
    ]
    const child = spawn('pg_dump', args, {
      env: { ...process.env, PGPASSWORD: conn.password },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const chunks: Buffer[] = []
    const errors: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(Buffer.concat(errors).toString('utf8') || `pg_dump exited ${code}`))
    })
  })
}

function compressDump(dump: Buffer): Buffer {
  return zstdCompressSync(dump)
}

function decompressDump(compressed: Buffer): Buffer {
  return zstdDecompressSync(compressed)
}

export async function ensureBackupSettings(db: Db): Promise<BackupSettingsView> {
  const [existing] = await db.select().from(backupSettings).limit(1)
  if (existing) return existing as BackupSettingsView

  const [created] = await db.insert(backupSettings).values({}).returning()
  return created as BackupSettingsView
}

export async function getBackupSettings(db: Db): Promise<BackupSettingsView> {
  return ensureBackupSettings(db)
}

export async function updateBackupSettings(
  db: Db,
  patch: Partial<Pick<BackupSettingsView, 'enabled' | 'scheduleCron' | 'retentionDaily' | 'retentionWeekly' | 'retentionMonthly' | 'storageMode' | 'notifyEmail'>>,
  actorId: string,
): Promise<BackupSettingsView> {
  const current = await ensureBackupSettings(db)
  const [updated] = await db.update(backupSettings)
    .set({
      ...patch,
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(backupSettings.id, current.id))
    .returning()
  return updated as BackupSettingsView
}

export async function listBackupRuns(db: Db, limit = 20): Promise<BackupRunSummary[]> {
  const rows = await db.select({
    id: backupRuns.id,
    filename: backupRuns.filename,
    status: backupRuns.status,
    trigger: backupRuns.trigger,
    encryptedBytes: backupRuns.encryptedBytes,
    sha256Checksum: backupRuns.sha256Checksum,
    errorMessage: backupRuns.errorMessage,
    driveFileId: backupRuns.driveFileId,
    driveUploadedAt: backupRuns.driveUploadedAt,
    createdBy: backupRuns.createdBy,
    startedAt: backupRuns.startedAt,
    finishedAt: backupRuns.finishedAt,
    createdAt: backupRuns.createdAt,
  })
    .from(backupRuns)
    .orderBy(desc(backupRuns.createdAt))
    .limit(limit)

  return rows as BackupRunSummary[]
}

export async function getLatestBackupRun(db: Db): Promise<BackupRunSummary | null> {
  const [row] = await listBackupRuns(db, 1)
  return row ?? null
}

async function assertNoRunningBackup(db: Db) {
  const [running] = await db.select({ id: backupRuns.id })
    .from(backupRuns)
    .where(eq(backupRuns.status, 'running'))
    .limit(1)
  if (running) throw new BackupsServiceError('ALREADY_RUNNING')
}

async function queueBackupNotification(
  db: Db,
  opts: { success: boolean, filename: string, trigger: string, error?: string, driveFileId?: string | null },
) {
  const settings = await ensureBackupSettings(db)
  const to = settings.notifyEmail?.trim() || defaultNotifyEmail()
  if (!to) return

  const mail = buildBackupNotificationEmail({
    success: opts.success,
    filename: opts.filename,
    trigger: opts.trigger,
    driveFileId: opts.driveFileId,
    error: opts.error,
    appUrl: getAppUrl(),
  })

  await enqueueJob(db, 'email_send', {
    to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })
}

async function maybeUploadToGoogleDrive(
  db: Db,
  runId: string,
  filename: string,
  encrypted: Buffer,
): Promise<string | null> {
  const integration = await getBackupIntegrationView(db)
  if (!integration.connected) return null

  try {
    const { fileId } = await uploadEncryptedBackupToDrive(db, filename, encrypted)
    await db.update(backupRuns)
      .set({ driveFileId: fileId, driveUploadedAt: new Date() })
      .where(eq(backupRuns.id, runId))
    return fileId
  }
  catch (err) {
    const message = err instanceof GoogleDriveBackupError
      ? err.message
      : err instanceof Error ? err.message : 'Google Drive upload failed'
    throw new Error(`Backup saved locally but Google Drive upload failed: ${message}`, { cause: err })
  }
}

async function executeBackupRun(
  db: Db,
  runId: string,
  filename: string,
  trigger: 'manual' | 'scheduled',
  actor: BackupActor | null,
  event: H3Event | null,
): Promise<BackupRunSummary> {
  const databaseUrl = getDatabaseUrl()?.trim()
  if (!databaseUrl) throw new BackupsServiceError('DUMP_FAILED')

  try {
    const conn = parseDatabaseUrl(databaseUrl)
    const dump = await runPgDump(conn)
    const compressed = compressDump(dump)
    const encrypted = encryptBuffer(compressed)
    const checksum = sha256Hex(encrypted)

    let driveFileId: string | null = null
    try {
      driveFileId = await maybeUploadToGoogleDrive(db, runId, filename, encrypted)
    }
    catch (driveErr) {
      const message = driveErr instanceof Error ? driveErr.message : 'Google Drive upload failed'
      await db.update(backupRuns)
        .set({
          status: 'failed',
          dumpBytes: dump.length,
          compressedBytes: compressed.length,
          encryptedBytes: encrypted.length,
          sha256Checksum: checksum,
          encryptedPayload: encrypted,
          errorMessage: message,
          finishedAt: new Date(),
        })
        .where(eq(backupRuns.id, runId))

      await writeAudit(event, {
        entityType: 'backup',
        entityId: runId,
        action: 'backup.failed',
        afterData: { filename, error: message, trigger },
        actor: actor ?? undefined,
        permissionKey: 'backups.manage.all',
        riskLevel: 'high',
      })
      await queueBackupNotification(db, { success: false, filename, trigger, error: message })
      throw driveErr
    }

    const [completed] = await db.update(backupRuns)
      .set({
        status: 'completed',
        dumpBytes: dump.length,
        compressedBytes: compressed.length,
        encryptedBytes: encrypted.length,
        sha256Checksum: checksum,
        encryptedPayload: encrypted,
        driveFileId,
        driveUploadedAt: driveFileId ? new Date() : null,
        finishedAt: new Date(),
      })
      .where(eq(backupRuns.id, runId))
      .returning()

    await writeAudit(event, {
      entityType: 'backup',
      entityId: runId,
      action: 'backup.completed',
      afterData: {
        filename,
        encryptedBytes: encrypted.length,
        sha256Checksum: checksum,
        trigger,
        driveFileId,
      },
      actor: actor ?? undefined,
      permissionKey: 'backups.manage.all',
      riskLevel: 'sensitive',
    })

    await queueBackupNotification(db, { success: true, filename, trigger, driveFileId })
    return completed as BackupRunSummary
  }
  catch (err) {
    if (err instanceof BackupsServiceError) throw err
    const message = err instanceof Error ? err.message : 'Backup failed'
    await db.update(backupRuns)
      .set({
        status: 'failed',
        errorMessage: message,
        finishedAt: new Date(),
      })
      .where(eq(backupRuns.id, runId))

    await writeAudit(event, {
      entityType: 'backup',
      entityId: runId,
      action: 'backup.failed',
      afterData: { filename, error: message, trigger },
      actor: actor ?? undefined,
      permissionKey: 'backups.manage.all',
      riskLevel: 'high',
    })
    await queueBackupNotification(db, { success: false, filename, trigger, error: message })
    throw err
  }
}

export async function runManualBackup(
  db: Db,
  actor: BackupActor,
  event: H3Event | null = null,
): Promise<BackupRunSummary> {
  const databaseUrl = getDatabaseUrl()?.trim()
  if (!databaseUrl) throw new BackupsServiceError('DUMP_FAILED')

  try {
    encryptBuffer(Buffer.from('probe'))
  }
  catch {
    throw new BackupsServiceError('KEY_MISSING')
  }

  await assertNoRunningBackup(db)

  const filename = backupFilename()
  const [run] = await db.insert(backupRuns).values({
    filename,
    status: 'running',
    trigger: 'manual',
    encryptedBytes: 0,
    sha256Checksum: 'pending',
    encryptedPayload: Buffer.alloc(0),
    createdBy: actor.id,
    startedAt: new Date(),
  }).returning()

  return executeBackupRun(db, run.id, filename, 'manual', actor, event)
}

export async function runScheduledBackup(db: Db): Promise<BackupRunSummary | null> {
  const settings = await ensureBackupSettings(db)
  if (!settings.enabled) return null

  const cron = settings.scheduleCron?.trim() || defaultScheduleCron()
  if (!isDailyCronDue(cron)) return null

  try {
    encryptBuffer(Buffer.from('probe'))
  }
  catch {
    return null
  }

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const [existingToday] = await db.select({ id: backupRuns.id })
    .from(backupRuns)
    .where(and(
      eq(backupRuns.trigger, 'scheduled'),
      gte(backupRuns.createdAt, startOfDay),
      sql`${backupRuns.status} IN ('running', 'completed')`,
    ))
    .limit(1)
  if (existingToday) return null

  await assertNoRunningBackup(db)

  const filename = backupFilename()
  const [run] = await db.insert(backupRuns).values({
    filename,
    status: 'running',
    trigger: 'scheduled',
    encryptedBytes: 0,
    sha256Checksum: 'pending',
    encryptedPayload: Buffer.alloc(0),
    startedAt: new Date(),
  }).returning()

  return executeBackupRun(db, run.id, filename, 'scheduled', null, null)
}

export async function enqueueScheduledBackupIfDue(db: Db): Promise<boolean> {
  const settings = await ensureBackupSettings(db)
  if (!settings.enabled) return false

  const cron = settings.scheduleCron?.trim() || defaultScheduleCron()
  if (!isDailyCronDue(cron)) return false

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const [existingToday] = await db.select({ id: backupRuns.id })
    .from(backupRuns)
    .where(and(
      eq(backupRuns.trigger, 'scheduled'),
      gte(backupRuns.createdAt, startOfDay),
    ))
    .limit(1)
  if (existingToday) return false

  const [running] = await db.select({ id: backupRuns.id })
    .from(backupRuns)
    .where(eq(backupRuns.status, 'running'))
    .limit(1)
  if (running) return false

  await enqueueJob(db, 'backup_run', { trigger: 'scheduled' })
  return true
}

export async function processBackupRunJob(db: Db, payload: { trigger?: string }): Promise<BackupRunSummary> {
  const trigger = payload.trigger === 'scheduled' ? 'scheduled' : 'manual'

  try {
    encryptBuffer(Buffer.from('probe'))
  }
  catch {
    throw new BackupsServiceError('KEY_MISSING')
  }

  await assertNoRunningBackup(db)

  const filename = backupFilename()
  const [run] = await db.insert(backupRuns).values({
    filename,
    status: 'running',
    trigger,
    encryptedBytes: 0,
    sha256Checksum: 'pending',
    encryptedPayload: Buffer.alloc(0),
    startedAt: new Date(),
  }).returning()

  return executeBackupRun(db, run.id, filename, trigger, null, null)
}

export async function getBackupEncryptedPayload(db: Db, runId: string): Promise<Buffer> {
  const [row] = await db.select({
    encryptedPayload: backupRuns.encryptedPayload,
    status: backupRuns.status,
  })
    .from(backupRuns)
    .where(eq(backupRuns.id, runId))
    .limit(1)

  if (!row || row.status !== 'completed') throw new BackupsServiceError('NOT_FOUND')
  return row.encryptedPayload
}

/** Decrypt + decompress a completed backup run — for verify/restore tests only. */
export async function decryptBackupRun(db: Db, runId: string): Promise<Buffer> {
  const encrypted = await getBackupEncryptedPayload(db, runId)
  const compressed = decryptBuffer(encrypted)
  return decompressDump(compressed)
}

/** Validate decrypted dump with pg_restore --list (no plaintext artifact retained). */
export async function verifyBackupRun(db: Db, runId: string): Promise<{ valid: boolean, tocEntries: number }> {
  const dump = await decryptBackupRun(db, runId)
  const dir = await mkdtemp(join(tmpdir(), 'dorinc-backup-'))
  const dumpPath = join(dir, 'verify.dump')

  try {
    await writeFile(dumpPath, dump)
    const entries = await pgRestoreList(dumpPath)
    return { valid: entries > 0, tocEntries: entries }
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function pgRestoreList(dumpPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('pg_restore', ['--list', dumpPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    const errors: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        const entries = stdout.split('\n').filter(line => /^\d+;/.test(line)).length
        resolve(entries)
      }
      else {
        reject(new Error(Buffer.concat(errors).toString('utf8') || `pg_restore --list exited ${code}`))
      }
    })
  })
}

/** Restore decrypted dump to a target database URL (integration tests). */
export async function restoreBackupToDatabase(dump: Buffer, targetUrl: string): Promise<void> {
  const conn = parseDatabaseUrl(targetUrl)
  const dir = await mkdtemp(join(tmpdir(), 'dorinc-restore-'))
  const dumpPath = join(dir, 'restore.dump')

  try {
    await writeFile(dumpPath, dump)

    await new Promise<void>((resolve, reject) => {
      const args = [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '-h', conn.host,
        '-p', conn.port,
        '-U', conn.user,
        '-d', conn.database,
        dumpPath,
      ]
      const child = spawn('pg_restore', args, {
        env: { ...process.env, PGPASSWORD: conn.password },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const errors: Buffer[] = []
      child.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(Buffer.concat(errors).toString('utf8') || `pg_restore exited ${code}`))
      })
    })
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function runSafetyBackup(
  db: Db,
  actor: BackupActor,
  event: H3Event | null,
): Promise<BackupRunSummary> {
  await assertNoRunningBackup(db)

  const filename = backupFilename()
  const [run] = await db.insert(backupRuns).values({
    filename,
    status: 'running',
    trigger: 'safety',
    encryptedBytes: 0,
    sha256Checksum: 'pending',
    encryptedPayload: Buffer.alloc(0),
    createdBy: actor.id,
    startedAt: new Date(),
  }).returning()

  return executeBackupRun(db, run!.id, filename, 'manual', actor, event)
}

export async function listRecoveryTests(db: Db, limit = 20): Promise<BackupRecoveryTestSummary[]> {
  const rows = await db.select()
    .from(backupRecoveryTests)
    .orderBy(desc(backupRecoveryTests.createdAt))
    .limit(limit)

  return rows as BackupRecoveryTestSummary[]
}

/** Admin recovery test — decrypt + pg_restore --list without production restore (P3-09). */
export async function runRecoveryTest(
  db: Db,
  backupRunId: string,
  actor: BackupActor,
): Promise<BackupRecoveryTestSummary> {
  const [run] = await db.select({ id: backupRuns.id, status: backupRuns.status })
    .from(backupRuns)
    .where(eq(backupRuns.id, backupRunId))
    .limit(1)

  if (!run || run.status !== 'completed') throw new BackupsServiceError('NOT_FOUND')

  const startedAt = new Date()
  const [test] = await db.insert(backupRecoveryTests).values({
    backupRunId,
    status: 'running',
    testedBy: actor.id,
    startedAt,
  }).returning()

  try {
    const result = await verifyBackupRun(db, backupRunId)
    const [completed] = await db.update(backupRecoveryTests)
      .set({
        status: result.valid ? 'passed' : 'failed',
        valid: result.valid,
        tocEntries: result.tocEntries,
        finishedAt: new Date(),
      })
      .where(eq(backupRecoveryTests.id, test!.id))
      .returning()

    if (!result.valid) throw new BackupsServiceError('VERIFY_FAILED')
    return completed as BackupRecoveryTestSummary
  }
  catch (err) {
    const message = err instanceof BackupsServiceError
      ? err.code
      : err instanceof Error ? err.message : 'Recovery test failed'

    await db.update(backupRecoveryTests)
      .set({
        status: 'failed',
        valid: false,
        errorMessage: message,
        finishedAt: new Date(),
      })
      .where(eq(backupRecoveryTests.id, test!.id))

    if (err instanceof BackupsServiceError) throw err
    throw new BackupsServiceError('VERIFY_FAILED')
  }
}

/**
 * Restore a completed backup to the live database (P3-08).
 * Creates a fresh safety backup first; requires Super Admin + step-up + reason.
 */
export async function restoreBackupFromRun(
  db: Db,
  backupRunId: string,
  actor: BackupActor,
  reason: string,
  event: H3Event | null = null,
): Promise<{ safetyBackupRunId: string, restoredFromRunId: string, restoredFilename: string }> {
  const [source] = await db.select({
    id: backupRuns.id,
    filename: backupRuns.filename,
    status: backupRuns.status,
  })
    .from(backupRuns)
    .where(eq(backupRuns.id, backupRunId))
    .limit(1)

  if (!source || source.status !== 'completed') throw new BackupsServiceError('NOT_FOUND')

  const databaseUrl = getDatabaseUrl()?.trim()
  if (!databaseUrl) throw new BackupsServiceError('RESTORE_FAILED')

  const safety = await runSafetyBackup(db, actor, event)
  if (safety.status !== 'completed') throw new BackupsServiceError('RESTORE_FAILED')

  try {
    const dump = await decryptBackupRun(db, backupRunId)
    await restoreBackupToDatabase(dump, databaseUrl)
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Restore failed'
    await writeAudit(event, {
      entityType: 'backup',
      entityId: backupRunId,
      action: 'backup.restore_failed',
      afterData: { filename: source.filename, reason, safetyBackupRunId: safety.id, error: message },
      actor,
      permissionKey: 'system.admin.all',
      riskLevel: 'high',
    })
    throw new BackupsServiceError('RESTORE_FAILED')
  }

  await writeAudit(event, {
    entityType: 'backup',
    entityId: backupRunId,
    action: 'backup.restored',
    afterData: {
      filename: source.filename,
      reason,
      safetyBackupRunId: safety.id,
    },
    actor,
    permissionKey: 'system.admin.all',
    riskLevel: 'high',
  })

  return {
    safetyBackupRunId: safety.id,
    restoredFromRunId: source.id,
    restoredFilename: source.filename,
  }
}

export async function getBackupHealth(db: Db): Promise<{
  status: 'not_configured' | 'healthy' | 'error'
  message: string
  lastRun: BackupRunSummary | null
  scheduleEnabled: boolean
  scheduleLabel: string
  driveConnected: boolean
  driveAccountEmail: string | null
}> {
  const settings = await ensureBackupSettings(db)
  const integration = await getBackupIntegrationView(db)
  const last = await getLatestBackupRun(db)

  const scheduleLabel = formatScheduleLabel(settings.scheduleCron)
  const driveConnected = integration.connected

  if (!last) {
    return {
      status: 'not_configured',
      message: driveConnected
        ? 'No encrypted backups yet — connect schedule or run a manual backup.'
        : 'No encrypted backups yet — run a manual backup or connect Google Drive.',
      lastRun: null,
      scheduleEnabled: settings.enabled,
      scheduleLabel,
      driveConnected,
      driveAccountEmail: integration.accountEmail,
    }
  }

  if (last.status === 'failed') {
    return {
      status: 'error',
      message: last.errorMessage ?? 'Last backup run failed.',
      lastRun: last,
      scheduleEnabled: settings.enabled,
      scheduleLabel,
      driveConnected,
      driveAccountEmail: integration.accountEmail,
    }
  }

  if (last.status === 'completed') {
    const when = last.finishedAt?.toISOString() ?? last.createdAt.toISOString()
    const sizeMb = (last.encryptedBytes / (1024 * 1024)).toFixed(2)
    const dest = last.driveFileId
      ? 'encrypted in database + Google Drive'
      : 'encrypted in database'
    return {
      status: 'healthy',
      message: `Last backup ${when} · ${sizeMb} MB · ${dest}`,
      lastRun: last,
      scheduleEnabled: settings.enabled,
      scheduleLabel,
      driveConnected,
      driveAccountEmail: integration.accountEmail,
    }
  }

  return {
    status: 'not_configured',
    message: 'A backup run is in progress.',
    lastRun: last,
    scheduleEnabled: settings.enabled,
    scheduleLabel,
    driveConnected,
    driveAccountEmail: integration.accountEmail,
  }
}
