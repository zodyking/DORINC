/** Worker-safe team chat notifications for local / Staples print events. */
import { insertTeamChatMessage } from '../workers/lib/team-chat.mjs'

function entityRefToken(entityType, entityId, entityLabel) {
  return `[[ref:${entityType}:${entityId}:${entityLabel}]]`
}

/**
 * @param {{
 *   documentLabel: string
 *   entityType?: string | null
 *   entityId?: string | null
 * }} opts
 */
export function buildDocumentPrintedTeamMessageBody(opts) {
  const refs = []
  let docPart = opts.documentLabel
  if (opts.entityType && opts.entityId) {
    docPart = entityRefToken(opts.entityType, opts.entityId, opts.documentLabel)
    refs.push({
      entityType: opts.entityType,
      entityId: opts.entityId,
      entityLabel: opts.documentLabel,
      position: 0,
    })
  }
  return {
    body: `${docPart} has been printed.`,
    refs,
  }
}

/**
 * @param {{
 *   jobId: string
 *   releaseCode: string
 *   documentLabel?: string | null
 *   entityType?: string | null
 *   entityId?: string | null
 * }} opts
 */
export function buildStaplesPrintReadyTeamMessageBody(opts) {
  const refs = [{
    entityType: 'staples_print_job',
    entityId: opts.jobId,
    entityLabel: opts.releaseCode,
    position: 0,
  }]
  const parts = [
    'A new Staples print order has been made. Order confirmation number',
    entityRefToken('staples_print_job', opts.jobId, opts.releaseCode),
  ]
  if (opts.entityType && opts.entityId && opts.documentLabel) {
    parts.push('for')
    parts.push(entityRefToken(opts.entityType, opts.entityId, opts.documentLabel))
    refs.push({
      entityType: opts.entityType,
      entityId: opts.entityId,
      entityLabel: opts.documentLabel,
      position: 1,
    })
  }
  parts.push('.')
  return { body: parts.join(' '), refs }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   senderUserId: string
 *   documentLabel: string
 *   entityType?: string | null
 *   entityId?: string | null
 * }} opts
 */
export async function notifyDocumentPrintedTeamMessage(pool, opts) {
  const { body, refs } = buildDocumentPrintedTeamMessageBody(opts)
  return insertTeamChatMessage(pool, {
    senderUserId: opts.senderUserId,
    body,
    entityRefs: refs,
    workflowNotification: true,
  })
}

/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   senderUserId: string
 *   jobId: string
 *   releaseCode: string
 *   documentLabel?: string | null
 *   entityType?: string | null
 *   entityId?: string | null
 * }} opts
 */
export async function notifyStaplesPrintReadyTeamMessage(pool, opts) {
  const { body, refs } = buildStaplesPrintReadyTeamMessageBody(opts)
  return insertTeamChatMessage(pool, {
    senderUserId: opts.senderUserId,
    body,
    entityRefs: refs,
    workflowNotification: true,
  })
}
