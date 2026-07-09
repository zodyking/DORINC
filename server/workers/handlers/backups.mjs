// backup_run handler — scheduled encrypted backups + Google Drive upload (SPEC §13, P2-17).
import { spawn } from 'node:child_process'
import { zstdCompressSync } from 'node:zlib'
import { decryptBuffer, encryptBuffer, sha256Hex } from '../lib/encryption.mjs'
import { getDatabaseUrl } from '../lib/runtime-config.mjs'

function defaultScheduleCron() {
  return process.env.BACKUP_SCHEDULE?.trim() || '0 2 * * *'
}

function defaultNotifyEmail(notifyEmail) {
  return notifyEmail?.trim()
    || process.env.ADMIN_BOOTSTRAP_EMAIL?.trim()
    || process.env.SMTP_FROM?.replace(/.*<([^>]+)>.*/, '$1').trim()
    || null
}

function isDailyCronDue(cron, now = new Date()) {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 2) return false
  const minute = Number(parts[0])
  const hour = Number(parts[1])
  if (!Number.isInteger(minute) || !Number.isInteger(hour)) return false
  return now.getUTCHours() === hour && now.getUTCMinutes() === minute
}

function backupFilename(now = new Date()) {
  const pad = n => String(n).padStart(2, '0')
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

function parseDatabaseUrl(url) {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parsed.port || '5432',
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  }
}

function runPgDump(conn) {
  return new Promise((resolve, reject) => {
    const args = [
      '--format=custom', '--no-owner', '--no-acl',
      '-h', conn.host, '-p', conn.port, '-U', conn.user, conn.database,
    ]
    const child = spawn('pg_dump', args, {
      env: { ...process.env, PGPASSWORD: conn.password },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks = []
    const errors = []
    child.stdout.on('data', chunk => chunks.push(chunk))
    child.stderr.on('data', chunk => errors.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(Buffer.concat(errors).toString('utf8') || `pg_dump exited ${code}`))
    })
  })
}

async function loadGoogleTokens(pool) {
  const { rows } = await pool.query(
    `SELECT id, encrypted_tokens, token_expires_at, folder_id, connected
     FROM backup_integrations WHERE provider = 'google_drive' LIMIT 1`,
  )
  const row = rows[0]
  if (!row?.connected || !row.encrypted_tokens) return null
  const tokens = JSON.parse(decryptBuffer(row.encrypted_tokens).toString('utf8'))
  return { row, tokens }
}

async function refreshGoogleAccessToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) throw new Error('Google OAuth not configured')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const payload = await res.json()
  if (!res.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? 'Token refresh failed')
  }
  return payload
}

async function getValidAccessToken(pool, integration) {
  const expiresAt = integration.row.token_expires_at
    ? new Date(integration.row.token_expires_at).getTime()
    : 0
  if (expiresAt > Date.now() + 60_000) return integration.tokens.accessToken

  const refreshed = await refreshGoogleAccessToken(integration.tokens.refreshToken)
  const nextTokens = {
    accessToken: refreshed.access_token,
    refreshToken: integration.tokens.refreshToken,
  }
  const encrypted = encryptBuffer(Buffer.from(JSON.stringify(nextTokens), 'utf8'))
  await pool.query(
    `UPDATE backup_integrations SET encrypted_tokens = $2, token_expires_at = $3, updated_at = now() WHERE id = $1`,
    [integration.row.id, encrypted, new Date(Date.now() + refreshed.expires_in * 1000)],
  )
  return refreshed.access_token
}

async function uploadToDrive(pool, filename, encryptedPayload) {
  const integration = await loadGoogleTokens(pool)
  if (!integration) return null

  const accessToken = await getValidAccessToken(pool, integration)
  const metadata = {
    name: filename,
    mimeType: 'application/octet-stream',
    description: 'DORINC Suite encrypted database backup (AES-256-GCM + zstd)',
  }
  if (integration.row.folder_id) metadata.parents = [integration.row.folder_id]

  const boundary = `dorinc_backup_${Date.now()}`
  const metaPart = JSON.stringify(metadata)
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`
      + `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    encryptedPayload,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  const payload = await res.json()
  if (!res.ok || !payload.id) {
    throw new Error(payload.error?.message ?? 'Google Drive upload failed')
  }
  return payload.id
}

async function queueNotification(pool, opts) {
  const { rows } = await pool.query(`SELECT notify_email FROM backup_settings LIMIT 1`)
  const to = defaultNotifyEmail(rows[0]?.notify_email)
  if (!to) return

  const subject = opts.success
    ? `DORINC backup completed — ${opts.filename}`
    : `DORINC backup failed — ${opts.filename}`
  const lines = [
    opts.success ? 'An encrypted database backup completed successfully.' : 'An encrypted database backup failed.',
    '',
    `File: ${opts.filename}`,
    `Trigger: ${opts.trigger}`,
  ]
  if (opts.driveFileId) lines.push(`Google Drive file: ${opts.driveFileId}`)
  if (opts.error) lines.push(`Error: ${opts.error}`)
  lines.push('', `Time: ${new Date().toISOString()}`)

  await pool.query(
    `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
     VALUES ('email_send', $1, 'queued', 0, 3, now())`,
    [JSON.stringify({ to, subject, text: lines.join('\n') })],
  )
}

async function executeBackup(pool, trigger) {
  const databaseUrl = getDatabaseUrl()?.trim()
  if (!databaseUrl) throw new Error('Database is not configured')

  try {
    encryptBuffer(Buffer.from('probe'))
  }
  catch {
    throw new Error('ENCRYPTION_MASTER_KEY is not configured')
  }

  const filename = backupFilename()
  const { rows } = await pool.query(
    `INSERT INTO backup_runs (filename, status, trigger, encrypted_bytes, sha256_checksum, encrypted_payload, started_at)
     VALUES ($1, 'running', $2, 0, 'pending', $3, now())
     RETURNING id`,
    [filename, trigger, Buffer.alloc(0)],
  )
  const runId = rows[0].id

  try {
    const conn = parseDatabaseUrl(databaseUrl)
    const dump = await runPgDump(conn)
    const compressed = zstdCompressSync(dump)
    const encrypted = encryptBuffer(compressed)
    const checksum = sha256Hex(encrypted)
    const driveFileId = await uploadToDrive(pool, filename, encrypted)

    await pool.query(
      `UPDATE backup_runs SET status = 'completed', dump_bytes = $2, compressed_bytes = $3,
       encrypted_bytes = $4, sha256_checksum = $5, encrypted_payload = $6,
       drive_file_id = $7, drive_uploaded_at = $8, finished_at = now()
       WHERE id = $1`,
      [
        runId,
        dump.length,
        compressed.length,
        encrypted.length,
        checksum,
        encrypted,
        driveFileId,
        driveFileId ? new Date() : null,
      ],
    )

    await queueNotification(pool, { success: true, filename, trigger, driveFileId })
    return { runId, filename, status: 'completed' }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Backup failed'
    await pool.query(
      `UPDATE backup_runs SET status = 'failed', error_message = $2, finished_at = now() WHERE id = $1`,
      [runId, message],
    )
    await queueNotification(pool, { success: false, filename, trigger, error: message })
    throw err
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function maybeEnqueueScheduledBackup(pool) {
  const { rows } = await pool.query(`SELECT enabled, schedule_cron FROM backup_settings LIMIT 1`)
  const settings = rows[0]
  if (!settings?.enabled) return false

  const cron = settings.schedule_cron?.trim() || defaultScheduleCron()
  if (!isDailyCronDue(cron)) return false

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const { rows: existing } = await pool.query(
    `SELECT id FROM backup_runs
     WHERE trigger = 'scheduled' AND created_at >= $1
     LIMIT 1`,
    [startOfDay],
  )
  if (existing[0]) return false

  const { rows: running } = await pool.query(
    `SELECT id FROM backup_runs WHERE status = 'running' LIMIT 1`,
  )
  if (running[0]) return false

  await pool.query(
    `INSERT INTO worker_jobs (job_type, payload, status, attempts, max_attempts, run_after)
     VALUES ('backup_run', $1, 'queued', 0, 3, now())`,
    [JSON.stringify({ trigger: 'scheduled' })],
  )
  return true
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 */
export async function processBackupJobs(pool, batch = 1) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'backup_run' AND status = 'queued' AND run_after <= now()
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
      )
      job = rows[0]
      if (job) {
        await client.query(
          `UPDATE worker_jobs SET status = 'processing', attempts = attempts + 1, started_at = now() WHERE id = $1`,
          [job.id],
        )
      }
      await client.query('COMMIT')
    }
    catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    }
    finally {
      client.release()
    }

    if (!job) break

    const trigger = job.payload?.trigger === 'scheduled' ? 'scheduled' : 'manual'
    try {
      await executeBackup(pool, trigger)
      await pool.query(
        `UPDATE worker_jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1`,
        [job.id],
      )
      processed++
    }
    catch (err) {
      failed++
      const message = err instanceof Error ? err.message : String(err)
      const attempts = job.attempts + 1
      if (attempts >= job.max_attempts) {
        await pool.query(
          `UPDATE worker_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`,
          [job.id, message],
        )
      }
      else {
        const backoffSec = Math.min(300, 30 * attempts)
        await pool.query(
          `UPDATE worker_jobs SET status = 'queued', last_error = $2,
           run_after = now() + ($3 || ' seconds')::interval WHERE id = $1`,
          [job.id, message, String(backoffSec)],
        )
      }
    }
  }

  return { processed, failed }
}
