import { loadSmtpConfig } from './app-config.mjs'

const IMAP_FILTERS_KEY = 'imap.filters'
const DEFAULT_AUTO_RESPONDER_MESSAGE = 'Thanks for contacting us. We received your email and a team member will reply shortly during business hours.'

function defaultAutoResponder() {
  return {
    enabled: false,
    scope: 'customers',
    subject: 'We received your message',
    message: DEFAULT_AUTO_RESPONDER_MESSAGE,
  }
}

function normalizeAutoResponder(raw) {
  return {
    enabled: raw?.enabled === true,
    scope: raw?.scope === 'all' ? 'all' : 'customers',
    subject: String(raw?.subject ?? '').trim() || 'We received your message',
    message: String(raw?.message ?? '').trim() || DEFAULT_AUTO_RESPONDER_MESSAGE,
  }
}

function defaultFilters(smtp) {
  const fromMatch = smtp?.from?.match(/<([^>]+)>/)
  const companyEmail = fromMatch?.[1]?.trim() || smtp?.from?.trim() || ''
  return {
    companyEmail,
    additionalEmails: [],
    includeCustomerEmails: true,
    autoResponder: defaultAutoResponder(),
  }
}

/**
 * @param {import('pg').Pool} pool
 */
export async function loadImapFilters(pool) {
  const smtp = await loadSmtpConfig(pool)
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    [IMAP_FILTERS_KEY],
  )
  const raw = rows[0]?.value
  if (!raw || typeof raw !== 'object') return defaultFilters(smtp)

  return {
    companyEmail: String(raw.companyEmail ?? '').trim() || defaultFilters(smtp).companyEmail,
    additionalEmails: Array.isArray(raw.additionalEmails)
      ? raw.additionalEmails.map(e => String(e).trim().toLowerCase()).filter(Boolean)
      : [],
    includeCustomerEmails: raw.includeCustomerEmails !== false,
    autoResponder: normalizeAutoResponder(raw.autoResponder),
  }
}
