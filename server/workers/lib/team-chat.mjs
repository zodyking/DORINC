/** Worker-safe default team chat helpers (mirrors team-chat.service.ts). */

import { notifyChatMessageReceivedWorker } from './chat-notifications.mjs'

export const TEAM_CHAT_TITLE = 'Team'

/**
 * @param {import('pg').Pool} pool
 */
export async function getDefaultTeamConversationId(pool) {
  const system = await pool.query(
    `SELECT id FROM conversations
     WHERE type = 'team' AND is_system = true
     ORDER BY created_at ASC
     LIMIT 1`,
  )
  if (system.rows[0]?.id) return system.rows[0].id

  const legacy = await pool.query(
    `SELECT id FROM conversations
     WHERE type = 'team'
     ORDER BY created_at ASC
     LIMIT 1`,
  )
  return legacy.rows[0]?.id ?? null
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} conversationId
 */
async function promoteTeamConversation(pool, conversationId) {
  await pool.query(
    `UPDATE conversations
     SET is_system = true,
         title = COALESCE(NULLIF(title, ''), $2),
         updated_at = now()
     WHERE id = $1 AND type = 'team'`,
    [conversationId, TEAM_CHAT_TITLE],
  )
}

/**
 * @param {import('pg').Pool} pool
 */
export async function listEligibleTeamChatStaffIds(pool) {
  const { rows } = await pool.query(
    `SELECT u.id
     FROM users u
     INNER JOIN account_types at ON at.id = u.account_type_id
     WHERE u.is_active = true
       AND u.approved_at IS NOT NULL
       AND u.team_chat_enabled = true
       AND at.key <> 'customer'`,
  )
  return rows.map(row => row.id)
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} conversationId
 */
export async function syncTeamChatParticipants(pool, conversationId) {
  const eligibleIds = await listEligibleTeamChatStaffIds(pool)
  const { rows: existingRows } = await pool.query(
    `SELECT user_id FROM conversation_participants WHERE conversation_id = $1`,
    [conversationId],
  )
  const existingIds = new Set(existingRows.map(row => row.user_id))
  const eligibleSet = new Set(eligibleIds)

  const toAdd = eligibleIds.filter(id => !existingIds.has(id))
  for (const userId of toAdd) {
    await pool.query(
      `INSERT INTO conversation_participants (conversation_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [conversationId, userId],
    )
  }

  const toRemove = [...existingIds].filter(id => !eligibleSet.has(id))
  if (toRemove.length) {
    await pool.query(
      `DELETE FROM conversation_participants
       WHERE conversation_id = $1 AND user_id = ANY($2::uuid[])`,
      [conversationId, toRemove],
    )
  }

  return conversationId
}

/**
 * Ensure the shared Team channel exists and participants are synced.
 * Recreates the channel when it was accidentally removed.
 *
 * @param {import('pg').Pool} pool
 */
export async function ensureDefaultTeamConversation(pool) {
  let conversationId = await getDefaultTeamConversationId(pool)
  if (conversationId) {
    await promoteTeamConversation(pool, conversationId)
  }
  else {
    const { rows } = await pool.query(
      `INSERT INTO conversations (type, title, is_system)
       VALUES ('team', $1, true)
       RETURNING id`,
      [TEAM_CHAT_TITLE],
    )
    conversationId = rows[0]?.id
  }

  if (!conversationId) {
    throw new Error('Failed to ensure default team conversation')
  }

  await syncTeamChatParticipants(pool, conversationId)
  return conversationId
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} senderUserId
 * @param {string} body
 * @param {Array<{ entityType: string, entityId: string, entityLabel: string, position: number }>} refs
 */
export async function insertTeamChatMessage(pool, senderUserId, body, refs) {
  const conversationId = await ensureDefaultTeamConversation(pool)

  const { rows } = await pool.query(
    `INSERT INTO messages (conversation_id, sender_user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [conversationId, senderUserId, body],
  )
  const messageId = rows[0]?.id
  if (!messageId) {
    throw new Error('Failed to insert team chat message')
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

  try {
    await notifyChatMessageReceivedWorker(pool, {
      conversationId,
      messageId,
      senderUserId,
      body,
      isTeamChat: true,
    })
  }
  catch (err) {
    console.warn(
      '[team-chat] chat email notification failed:',
      err instanceof Error ? err.message : err,
    )
  }

  return { conversationId, messageId }
}
