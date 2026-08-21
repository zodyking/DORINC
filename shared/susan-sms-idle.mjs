/**
 * Susan SMS idle timeout — 5 minutes of no staff reply.
 * Shared by the inbound handler (TS) and the dedicated worker (.mjs).
 */

export const SUSAN_SMS_IDLE_MS = 5 * 60 * 1000
export const SUSAN_SMS_IDLE_SECONDS = 5 * 60
export const SUSAN_SMS_HISTORY_LIMIT = 20

const MENU_PHRASE_RE = /^(menu|text menu|help|actions|what can you do|what can i do)[\s?!.]*$/i

const ACTION_TOPICS = {
  send_invoice: 'sending an invoice',
  send_estimate: 'sending an estimate',
  send_email: 'sending an email',
  lookup_invoice: 'looking up an invoice',
  lookup_customer: 'looking up a customer',
  lookup_service_log: 'looking up a service log',
  search_catalog: 'searching the catalog',
}

const CONFIRM_TOPICS = {
  send_invoice: 'sending an invoice',
  send_estimate: 'sending an estimate',
  send_email: 'sending an email',
}

/**
 * @param {'user_reply' | 'carrier'} kind
 * @param {Date} [now]
 */
export function susanSmsIdleThreadPatch(kind, now = new Date()) {
  if (kind === 'user_reply') {
    return { lastUserAt: now, idleClosedAt: null, optedOutAt: null }
  }
  if (kind === 'carrier') {
    return { idleClosedAt: now, optedOutAt: now }
  }
  return {}
}

function docRef(text) {
  const match = String(text || '').match(/\b(?:INV|EST|SL)[- ]?\d+\b/i)
  return match ? match[0].toUpperCase().replace(/\s+/g, '') : null
}

function shortQuery(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= 40) return text
  return `${text.slice(0, 37).trim()}…`
}

/**
 * @param {unknown} pending
 * @param {string | null | undefined} lastUserText
 * @returns {string | null}
 */
export function topicForSusanSmsIdle(pending, lastUserText) {
  const action = pending && typeof pending === 'object' ? pending : null

  if (action?.kind === 'confirm') {
    const ref = docRef(action.preview)
    if (action.tool === 'send_invoice') return ref ? `sending ${ref}` : CONFIRM_TOPICS.send_invoice
    if (action.tool === 'send_estimate') return ref ? `sending ${ref}` : CONFIRM_TOPICS.send_estimate
    if (action.tool === 'send_email') {
      const who = shortQuery(action.args?.toEmail || action.args?.recipientLabel)
      return who ? `emailing ${who}` : CONFIRM_TOPICS.send_email
    }
  }

  if (action?.kind === 'wizard') {
    const query = shortQuery(
      action.data?.query
      || action.data?.recipientLabel
      || action.data?.toEmail
      || action.data?.subject,
    )
    switch (action.action) {
      case 'send_invoice':
        return query ? `sending an invoice for ${query}` : ACTION_TOPICS.send_invoice
      case 'send_estimate':
        return query ? `sending an estimate for ${query}` : ACTION_TOPICS.send_estimate
      case 'send_email':
        return query ? `emailing ${query}` : ACTION_TOPICS.send_email
      case 'lookup_invoice':
        return query ? `looking up ${query}` : ACTION_TOPICS.lookup_invoice
      case 'lookup_customer':
        return query ? `looking up ${query}` : ACTION_TOPICS.lookup_customer
      case 'lookup_service_log':
        return query ? `looking up ${query}` : ACTION_TOPICS.lookup_service_log
      case 'search_catalog':
        return query ? `searching for ${query}` : ACTION_TOPICS.search_catalog
      default:
        break
    }
  }

  const user = String(lastUserText || '').trim()
  if (MENU_PHRASE_RE.test(user)) return 'the action menu'
  return null
}

/**
 * @param {string | null | undefined} topic
 */
export function formatSusanSmsIdleTimeoutMessage(topic) {
  const first = topic
    ? `Glad I could help with ${topic}.`
    : 'Glad I could help.'
  return [
    first,
    '',
    'This session timed out after 5 minutes of quiet.',
    `Text me anytime — I'm Susan, your personal AI assistant.`,
  ].join('\n')
}

/**
 * @param {unknown} messages
 * @returns {string | null}
 */
export function lastSusanSmsUserText(messages) {
  if (!Array.isArray(messages)) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]
    if (row?.role === 'user' && typeof row.content === 'string' && row.content.trim()) {
      return row.content
    }
  }
  return null
}
