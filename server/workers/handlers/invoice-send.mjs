// invoice_send handler — waits for PDF, emails attachment, then marks invoice sent.
import nodemailer from 'nodemailer'
import { loadSmtpConfig } from '../lib/app-config.mjs'

let _transport
let _transportKey

function buildTransport(config) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  })
}

async function getTransport(pool) {
  const config = await loadSmtpConfig(pool)
  if (!config?.host || !config.from) {
    throw new Error('SMTP is not configured')
  }
  const key = `${config.host}:${config.port}:${config.user}:${config.from}`
  if (!_transport || _transportKey !== key) {
    _transport = buildTransport(config)
    _transportKey = key
  }
  return { transport: _transport, from: config.from }
}

async function loadInvoicePdf(pool, invoiceId) {
  const { rows } = await pool.query(
    `SELECT f.original_filename, f.binary_data, f.mime_type
     FROM invoice_files inf
     INNER JOIN app_files f ON f.id = inf.file_id
     WHERE inf.invoice_id = $1
     LIMIT 1`,
    [invoiceId],
  )
  return rows[0] ?? null
}

async function loadPendingPdfJob(pool, invoiceId) {
  const { rows } = await pool.query(
    `SELECT id, status, last_error
     FROM pdf_render_jobs
     WHERE entity_type = 'invoice'
       AND entity_id = $1
       AND status IN ('queued', 'processing')
     ORDER BY created_at DESC
     LIMIT 1`,
    [invoiceId],
  )
  return rows[0] ?? null
}

async function loadFailedPdfJob(pool, invoiceId) {
  const { rows } = await pool.query(
    `SELECT id, status, last_error
     FROM pdf_render_jobs
     WHERE entity_type = 'invoice'
       AND entity_id = $1
       AND status = 'failed'
     ORDER BY created_at DESC
     LIMIT 1`,
    [invoiceId],
  )
  return rows[0] ?? null
}

async function markInvoiceSent(pool, invoiceId, actorId) {
  const { rowCount } = await pool.query(
    `UPDATE invoices
     SET status = 'sent', sent_at = now(), updated_by = $2, updated_at = now()
     WHERE id = $1 AND status = 'approved'`,
    [invoiceId, actorId],
  )
  return rowCount > 0
}

async function deliverInvoiceEmail(pool, payload, pdfRow) {
  const to = String(payload.recipientEmail ?? payload.to ?? '')
  const subject = String(payload.subject ?? '')
  const text = String(payload.text ?? '')
  const html = payload.html ? String(payload.html) : undefined
  const filename = String(payload.attachmentFilename ?? pdfRow.original_filename ?? 'invoice.pdf')

  if (!to || !subject) throw new Error('invoice_send payload missing recipient/subject')

  const { transport, from } = await getTransport(pool)

  await transport.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments: [{
      filename,
      content: pdfRow.binary_data,
      contentType: pdfRow.mime_type ?? 'application/pdf',
    }],
  })
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} [batch]
 */
export async function processInvoiceSendJobs(pool, batch = 3) {
  let processed = 0
  let failed = 0

  for (let i = 0; i < batch; i++) {
    const client = await pool.connect()
    let job
    try {
      await client.query('BEGIN')
      const { rows } = await client.query(
        `SELECT id, payload, attempts, max_attempts FROM worker_jobs
         WHERE job_type = 'invoice_send' AND status = 'queued' AND run_after <= now()
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

    const payload = job.payload ?? {}
    const invoiceId = String(payload.invoiceId ?? '')
    const actorId = String(payload.actorId ?? '')

    try {
      if (!invoiceId) throw new Error('invoice_send payload missing invoiceId')

      const { rows: invoiceRows } = await pool.query(
        `SELECT id, status, customer_id, invoice_number, due_date, total
         FROM invoices WHERE id = $1`,
        [invoiceId],
      )
      const invoice = invoiceRows[0]
      if (!invoice) throw new Error('Invoice not found')

      if (invoice.status === 'sent' || invoice.status === 'paid') {
        await pool.query(
          `UPDATE worker_jobs SET status = 'done', finished_at = now(), last_error = NULL WHERE id = $1`,
          [job.id],
        )
        processed++
        continue
      }

      if (invoice.status !== 'approved') {
        throw new Error(`Invoice cannot be sent from status ${invoice.status}`)
      }

      const pdfRow = await loadInvoicePdf(pool, invoiceId)
      if (!pdfRow) {
        const pendingPdf = await loadPendingPdfJob(pool, invoiceId)
        if (pendingPdf) {
          await pool.query(
            `UPDATE worker_jobs
             SET status = 'queued', run_after = now() + interval '10 seconds', last_error = 'Waiting for PDF render'
             WHERE id = $1`,
            [job.id],
          )
          continue
        }

        const failedPdf = await loadFailedPdfJob(pool, invoiceId)
        if (failedPdf) {
          throw new Error(`PDF render failed: ${failedPdf.last_error ?? 'unknown error'}`)
        }

        throw new Error('Invoice PDF is not ready — ensure pdf-worker is running')
      }

      if (!payload.subject) {
        const invNum = `INV-${String(invoice.invoice_number).padStart(6, '0')}`
        payload.subject = `Invoice ${invNum} is ready`
        payload.text = [
          `Hello ${payload.recipientName ?? 'there'},`,
          '',
          `Invoice ${invNum} is attached.`,
          invoice.due_date ? `Due date: ${invoice.due_date}` : '',
          invoice.total ? `Total: ${invoice.total}` : '',
        ].filter(Boolean).join('\n')
        payload.html = `<p>Hello ${payload.recipientName ?? 'there'},</p><p>Invoice <strong>${invNum}</strong> is attached.</p>`
        payload.attachmentFilename = pdfRow.original_filename
      }

      await deliverInvoiceEmail(pool, payload, pdfRow)

      const marked = await markInvoiceSent(pool, invoiceId, actorId)
      if (!marked) {
        throw new Error('Invoice status changed before send could complete')
      }

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
      const waitingForPdf = message.includes('Waiting for PDF') || message.includes('not ready')

      if (waitingForPdf && attempts < job.max_attempts) {
        await pool.query(
          `UPDATE worker_jobs
           SET status = 'queued', run_after = now() + interval '10 seconds', last_error = $2
           WHERE id = $1`,
          [job.id, message],
        )
        continue
      }

      if (attempts >= job.max_attempts) {
        await pool.query(
          `UPDATE worker_jobs SET status = 'failed', finished_at = now(), last_error = $2 WHERE id = $1`,
          [job.id, message],
        )
      }
      else {
        const backoff = message.includes('PDF') ? 15 : 30 * 2 ** (attempts - 1)
        await pool.query(
          `UPDATE worker_jobs
           SET status = 'queued', run_after = now() + make_interval(secs => $2), last_error = $3
           WHERE id = $1`,
          [job.id, backoff, message],
        )
      }
    }
  }

  return { processed, failed }
}
