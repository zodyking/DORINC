/** Post "invoice sent" team chat message after SMTP delivery succeeds (worker-safe). */

function formatInvoiceNumber(invoiceNumber) {
  return `INV-${String(invoiceNumber).padStart(6, '0')}`
}

function entityRefToken(entityType, entityId, entityLabel) {
  return `[[ref:${entityType}:${entityId}:${entityLabel}]]`
}

async function getTeamConversationId(pool) {
  const { rows } = await pool.query(
    `SELECT id FROM conversations
     WHERE type = 'team' AND is_system = true
     LIMIT 1`,
  )
  return rows[0]?.id ?? null
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   senderUserId: string
 *   invoiceId: string
 *   invoiceNumber: number
 *   customerId: string | null
 *   customerName: string
 * }} opts
 */
export async function notifyInvoiceSentTeamMessage(pool, opts) {
  const conversationId = await getTeamConversationId(pool)
  if (!conversationId) return

  const invoiceLabel = formatInvoiceNumber(opts.invoiceNumber)
  const parts = [
    entityRefToken('invoice', opts.invoiceId, invoiceLabel),
    'has been sent to',
  ]
  if (opts.customerId) {
    parts.push(entityRefToken('customer', opts.customerId, opts.customerName))
  }
  else {
    parts.push(opts.customerName)
  }
  const body = parts.join(' ')

  const { rows } = await pool.query(
    `INSERT INTO messages (conversation_id, sender_user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [conversationId, opts.senderUserId, body],
  )
  const messageId = rows[0]?.id
  if (!messageId) return

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

  for (const ref of refs) {
    await pool.query(
      `INSERT INTO message_entity_refs
        (message_id, entity_type, entity_id, entity_label, position)
       VALUES ($1, $2, $3, $4, $5)`,
      [messageId, ref.entityType, ref.entityId, ref.entityLabel, ref.position],
    )
  }

  await pool.query(
    `UPDATE conversations SET updated_at = now() WHERE id = $1`,
    [conversationId],
  )
}
