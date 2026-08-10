import { decryptBuffer, hydrateMasterKeyFromDb } from './encryption.mjs'

const APP_CONFIG_KEYS = {
  masterKey: 'security.master_key',
  smtp: 'smtp.config',
  imap: 'imap.config',
  quo: 'quo.config',
}

async function decryptSetting(pool, encryptedValue) {
  if (!encryptedValue) return null
  try {
    await hydrateMasterKeyFromDb(pool)
    return decryptBuffer(Buffer.from(encryptedValue, 'base64'))
  }
  catch (err) {
    console.warn('[worker] failed to decrypt app_settings secret:', err instanceof Error ? err.message : err)
    return null
  }
}

function envSmtpConfig() {
  const envHost = process.env.SMTP_HOST?.trim()
  const envFrom = process.env.SMTP_FROM?.trim()
  if (!envHost || !envFrom) return null
  return {
    host: envHost,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER?.trim() ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: envFrom,
  }
}

function envImapConfig() {
  const envHost = process.env.IMAP_HOST?.trim()
  const envUser = process.env.IMAP_USER?.trim()
  if (!envHost || !envUser) return null
  return {
    host: envHost,
    port: Number(process.env.IMAP_PORT ?? 993),
    user: envUser,
    pass: process.env.IMAP_PASS ?? '',
    mailbox: process.env.IMAP_MAILBOX?.trim() || 'INBOX',
    useTls: process.env.IMAP_TLS !== 'false',
  }
}

/**
 * Load SMTP config from app_settings (UI setup) with env fallback.
 * @param {import('pg').Pool} pool
 */
export async function loadSmtpConfig(pool) {
  const { rows } = await pool.query(
    `SELECT key, value, encrypted_value FROM app_settings WHERE key = ANY($1)`,
    [[APP_CONFIG_KEYS.masterKey, APP_CONFIG_KEYS.smtp]],
  )

  const byKey = new Map(rows.map(r => [r.key, r]))
  const smtpRow = byKey.get(APP_CONFIG_KEYS.smtp)
  if (smtpRow?.encrypted_value) {
    const decrypted = await decryptSetting(pool, smtpRow.encrypted_value)
    if (decrypted) {
      const json = JSON.parse(decrypted.toString('utf8'))
      return {
        host: json.host,
        port: Number(json.port ?? 587),
        user: json.user ?? '',
        pass: json.pass ?? '',
        from: json.from,
      }
    }
  }

  return envSmtpConfig()
}

/**
 * Load IMAP config from app_settings (UI setup) with env fallback.
 * @param {import('pg').Pool} pool
 */
export async function loadImapConfig(pool) {
  const { rows } = await pool.query(
    `SELECT key, value, encrypted_value FROM app_settings WHERE key = ANY($1)`,
    [[APP_CONFIG_KEYS.masterKey, APP_CONFIG_KEYS.imap]],
  )

  const byKey = new Map(rows.map(r => [r.key, r]))
  const imapRow = byKey.get(APP_CONFIG_KEYS.imap)
  if (imapRow?.encrypted_value) {
    const decrypted = await decryptSetting(pool, imapRow.encrypted_value)
    if (decrypted) {
      const json = JSON.parse(decrypted.toString('utf8'))
      return {
        host: json.host,
        port: Number(json.port ?? 993),
        user: json.user ?? '',
        pass: json.pass ?? '',
        mailbox: json.mailbox?.trim() || 'INBOX',
        useTls: json.useTls !== false,
      }
    }
  }

  return envImapConfig()
}

/**
 * Load Quo SMS config from encrypted app_settings.
 * Uses the same master-key hydration as AI/backup workers so passphrase /
 * non-hex DB keys decrypt correctly (the previous hex-only path caused
 * notifications to fail while Nitro test SMS still worked).
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ enabled: boolean, apiKey: string, fromNumber: string } | null>}
 */
export async function loadQuoConfig(pool) {
  const { rows } = await pool.query(
    `SELECT key, value, encrypted_value FROM app_settings WHERE key = ANY($1)`,
    [[APP_CONFIG_KEYS.masterKey, APP_CONFIG_KEYS.quo]],
  )

  const byKey = new Map(rows.map(r => [r.key, r]))
  const quoRow = byKey.get(APP_CONFIG_KEYS.quo)
  if (!quoRow?.encrypted_value) return null

  const decrypted = await decryptSetting(pool, quoRow.encrypted_value)
  if (!decrypted) return null

  try {
    const json = JSON.parse(decrypted.toString('utf8'))
    return {
      enabled: Boolean(json.enabled),
      apiKey: typeof json.apiKey === 'string' ? json.apiKey : '',
      fromNumber: typeof json.fromNumber === 'string' ? json.fromNumber : '',
    }
  }
  catch {
    return null
  }
}
