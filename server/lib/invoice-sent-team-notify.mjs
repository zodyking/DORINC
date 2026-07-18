/** Post invoice sent/resent team chat messages after SMTP delivery succeeds (worker-safe). */
import { insertTeamChatMessage } from '../workers/lib/team-chat.mjs'

function formatInvoiceNumber(invoiceNumber) {
  return `INV-${String(invoiceNumber).padStart(6, '0')}`
}

function entityRefToken(entityType, entityId, entityLabel) {
  return `[[ref:${entityType}:${entityId}:${entityLabel}]]`
}

function joinWithCommasAnd(items, conjunction = 'and') {
  if (items.length <= 1) return items[0] ?? ''
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`
}

function verbPhrase(count, isResend) {
  const verb = isResend ? 'resent' : 'sent'
  return count === 1 ? `has been ${verb} to` : `have been ${verb} to`
}

/**
 * @param {{
 *   invoiceId: string
 *   invoiceNumber: number
 *   customerId: string | null
 *   customerName: string
 *   isResend?: boolean
 * }} opts
 */
export function buildInvoiceSentTeamMessageBody(opts) {
  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const parts = [
    entityRefToken('invoice', opts.invoiceId, invoiceLabel),
    verbPhrase(1, !!opts.isResend),
  ]
  if (opts.customerId) {
    parts.push(entityRefToken('customer', opts.customerId, opts.customerName))
  }
  else {
    parts.push(opts.customerName)
  }
  return {
    body: parts.join(' '),
    refs: buildInvoiceSentTeamMessageRefs(opts),
  }
}

/**
 * @param {{
 *   invoiceId: string
 *   invoiceNumber: number
 *   customerId: string | null
 *   customerName: string
 *   isResend?: boolean
 * }} opts
 */
export function buildInvoiceSentTeamMessageRefs(opts) {
  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const refs = [
    { entityType: 'invoice', entityId: opts.invoiceId, entityLabel: invoiceLabel, position: 0 },
  ]
  if (opts.customerId) {
    refs.push({
      entityType: 'customer',
      entityId: opts.customerId,
      entityLabel: opts.customerName,
      position: 1,
    })
  }
  return refs
}

/**
 * @param {{
 *   customerId: string | null
 *   customerName: string
 *   invoices: Array<{ invoiceId: string, invoiceNumber: number, isResend: boolean }>
 * }} opts
 */
export function buildBulkInvoiceSentTeamMessageBody(opts) {
  const sent = opts.invoices.filter(inv => !inv.isResend)
  const resent = opts.invoices.filter(inv => inv.isResend)
  const customerToken = opts.customerId
    ? entityRefToken('customer', opts.customerId, opts.customerName)
    : opts.customerName

  const sections = []
  for (const group of [sent, resent]) {
    if (!group.length) continue
    const invoiceTokens = group.map((inv) => {
      const label = formatInvoiceNumber(inv.invoiceNumber)
      return entityRefToken('invoice', inv.invoiceId, label)
    })
    sections.push(`${joinWithCommasAnd(invoiceTokens)} ${verbPhrase(group.length, group === resent)} ${customerToken}`)
  }

  const body = sections.join('. ')
  const refs = []
  let position = 0
  for (const inv of opts.invoices) {
    const label = formatInvoiceNumber(inv.invoiceNumber)
    refs.push({
      entityType: 'invoice',
      entityId: inv.invoiceId,
      entityLabel: label,
      position: position++,
    })
  }
  if (opts.customerId) {
    refs.push({
      entityType: 'customer',
      entityId: opts.customerId,
      entityLabel: opts.customerName,
      position: position,
    })
  }

  return { body, refs }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} senderUserId
 * @param {string} body
 * @param {Array<{ entityType: string, entityId: string, entityLabel: string, position: number }>} refs
 */
async function postTeamChatMessage(pool, senderUserId, body, refs) {
  try {
    await insertTeamChatMessage(pool, senderUserId, body, refs)
  }
  catch (err) {
    console.warn(
      '[invoice-sent-team-notify] failed to post team chat message:',
      err instanceof Error ? err.message : err,
    )
    throw err
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   senderUserId: string
 *   invoiceId: string
 *   invoiceNumber: number
 *   customerId: string | null
 *   customerName: string
 *   isResend?: boolean
 * }} opts
 */
export async function notifyInvoiceSentTeamMessage(pool, opts) {
  const { body, refs } = buildInvoiceSentTeamMessageBody(opts)
  await postTeamChatMessage(pool, opts.senderUserId, body, refs)
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   senderUserId: string
 *   customerId: string | null
 *   customerName: string
 *   invoices: Array<{ invoiceId: string, invoiceNumber: number, isResend: boolean }>
 * }} opts
 */
export async function notifyBulkInvoiceSentTeamMessage(pool, opts) {
  if (!opts.invoices.length) return
  const { body, refs } = buildBulkInvoiceSentTeamMessageBody(opts)
  await postTeamChatMessage(pool, opts.senderUserId, body, refs)
}

/**
 * When the last invoice_send job in a bulk batch finishes, post one consolidated team message.
 * @param {import('pg').Pool} pool
 * @param {string} batchId
 */
export async function tryFinalizeBulkInvoiceSendNotify(pool, batchId) {
  if (!batchId) return

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: batchJobs } = await client.query(
      `SELECT id, status, payload
       FROM worker_jobs
       WHERE job_type = 'invoice_send'
         AND payload->>'bulkSendBatchId' = $1
       FOR UPDATE`,
      [batchId],
    )

    if (!batchJobs.length) {
      await client.query('COMMIT')
      return
    }

    const alreadyPosted = batchJobs.some(job => job.payload?.bulkNotifyPosted === true)
    if (alreadyPosted) {
      await client.query('COMMIT')
      return
    }

    const pending = batchJobs.filter(job => job.status === 'queued' || job.status === 'processing')
    if (pending.length) {
      await client.query('COMMIT')
      return
    }

    const successful = batchJobs.filter(job => job.status === 'done')
    if (!successful.length) {
      await client.query(
        `UPDATE worker_jobs
         SET payload = payload || '{"bulkNotifyPosted": true}'::jsonb
         WHERE id = ANY($1::uuid[])`,
        [batchJobs.map(job => job.id)],
      )
      await client.query('COMMIT')
      return
    }

    const samplePayload = successful[0]?.payload ?? {}
    const senderUserId = String(samplePayload.actorId ?? '')
    if (!senderUserId) {
      await client.query('COMMIT')
      return
    }

    const invoiceIds = successful.map(job => String(job.payload?.invoiceId ?? '')).filter(Boolean)
    const { rows: invoiceRows } = await client.query(
      `SELECT id, invoice_number, customer_id, status
       FROM invoices
       WHERE id = ANY($1::uuid[])`,
      [invoiceIds],
    )
    const invoiceById = new Map(invoiceRows.map(row => [row.id, row]))

    let customerId = samplePayload.customerId ?? null
    let customerName = samplePayload.recipientName ?? 'Customer'
    if (!customerId && invoiceRows[0]?.customer_id) {
      customerId = invoiceRows[0].customer_id
    }
    if (customerId) {
      const { rows: customerRows } = await client.query(
        `SELECT display_name FROM customers WHERE id = $1 LIMIT 1`,
        [customerId],
      )
      if (customerRows[0]?.display_name) customerName = customerRows[0].display_name
    }

    const invoices = successful
      .map((job) => {
        const invoiceId = String(job.payload?.invoiceId ?? '')
        const invoice = invoiceById.get(invoiceId)
        if (!invoice) return null
        return {
          invoiceId,
          invoiceNumber: invoice.invoice_number,
          isResend: job.payload?.wasResend === true,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.invoiceNumber - b.invoiceNumber)

    await client.query(
      `UPDATE worker_jobs
       SET payload = payload || '{"bulkNotifyPosted": true}'::jsonb
       WHERE id = ANY($1::uuid[])`,
      [batchJobs.map(job => job.id)],
    )

    await client.query('COMMIT')

    await notifyBulkInvoiceSentTeamMessage(pool, {
      senderUserId,
      customerId,
      customerName,
      invoices,
    })
  }
  catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
  finally {
    client.release()
  }
}
