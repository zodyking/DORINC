// email_send handler — delivers queued SMTP messages (SPEC §18).
// Plain JS + raw SQL for the worker container.
import nodemailer from 'nodemailer'

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 * @returns {Promise<{ processed: number, failed: number }>}
 */
export async function processMailJobs(pool, batch = 5) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'email_send' AND status = 'queued' AND run_after <= now()
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
      await deliverEmail(pool, job.payload)
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
      const credentialLogId = job.payload?.credentialLogId

      if (attempts >= job.max_attempts) {
        await pool.query(
          `UPDATE worker_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`,
          [job.id, message],
        )
        if (credentialLogId) {
          await pool.query(
            `UPDATE customer_credential_email_logs SET status = 'failed', error_message = $2 WHERE id = $1`,
            [credentialLogId, message],
          )
        }
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

/**
 * @param {import('pg').Pool} pool
 * @param {Record<string, unknown>} payload
 */
async function deliverEmail(pool, payload) {
  const to = String(payload.to ?? '')
  const subject = String(payload.subject ?? '')
  const text = String(payload.text ?? '')
  const html = payload.html ? String(payload.html) : undefined
  const credentialLogId = payload.credentialLogId ? String(payload.credentialLogId) : null

  if (!to || !subject) throw new Error('email_send payload missing to/subject')

  try {
    await getTransport().sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      html,
    })
  }
  catch (err) {
    if (process.env.NODE_ENV === 'production') throw err
    console.warn(`[mail-worker] delivery failed (dev mode — counted sent): ${err instanceof Error ? err.message : String(err)}`)
    console.info(`[mail-worker] to=${to} subject="${subject}"\n${text}`)
  }

  if (credentialLogId) {
    await pool.query(
      `UPDATE customer_credential_email_logs
       SET status = 'sent', sent_at = now(), error_message = NULL
       WHERE id = $1 AND status = 'queued'`,
      [credentialLogId],
    )
  }
}
