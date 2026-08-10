// sms_send handler — delivers queued Quo SMS messages.
import { loadQuoConfig } from '../lib/app-config.mjs'

const QUO_API_BASE = 'https://api.quo.com'

function normalizePhoneE164(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`
  return null
}

async function deliverSms(pool, payload) {
  const config = await loadQuoConfig(pool)
  if (!config?.apiKey || !config.fromNumber || !config.enabled) {
    throw new Error('Quo SMS is not enabled')
  }

  const to = normalizePhoneE164(payload?.to)
  const from = normalizePhoneE164(config.fromNumber) ?? String(config.fromNumber).trim()
  const content = String(payload?.body ?? '').trim()
  if (!to) throw new Error('Invalid destination phone number')
  if (!from) throw new Error('Quo from number is not configured')
  if (!content) throw new Error('SMS body is empty')

  const res = await fetch(`${QUO_API_BASE}/v1/messages`, {
    method: 'POST',
    headers: {
      Authorization: config.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: content.slice(0, 1600),
      from,
      to: [to],
    }),
  })

  const text = await res.text()
  if (!res.ok) {
    let message = `Quo API error (${res.status})`
    try {
      const body = text ? JSON.parse(text) : null
      if (body?.message) message = String(body.message)
    }
    catch {
      if (text) message = text.slice(0, 200)
    }
    throw new Error(message)
  }
}

/**
 * Process queued sms_send jobs (drain up to batch per call).
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function processSmsJobs(pool, batch = 20) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'sms_send' AND status = 'queued' AND run_after <= now()
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

    try {
      await deliverSms(pool, job.payload)
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
        await pool.query(
          `UPDATE worker_jobs SET status = 'queued', run_after = now() + make_interval(secs => $2), last_error = $3 WHERE id = $1`,
          [job.id, 30 * 2 ** (attempts - 1), message],
        )
      }
    }
  }

  return { processed, failed }
}
