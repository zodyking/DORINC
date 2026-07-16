import { createDecipheriv, createHash } from 'node:crypto'

const APP_CONFIG_KEYS = {
  masterKey: 'security.master_key',
  smtp: 'smtp.config',
  imap: 'imap.config',
}

function masterKeyFromEnvOrRow(masterHex) {
  const env = process.env.ENCRYPTION_MASTER_KEY?.trim()
  const keys = []
  if (masterHex && /^[0-9a-f]{64}$/i.test(masterHex)) keys.push(Buffer.from(masterHex, 'hex'))
  if (env) {
    const envKey = /^[0-9a-f]{64}$/i.test(env)
      ? Buffer.from(env, 'hex')
      : createHash('sha256').update(env).digest()
    if (!keys.some(k => k.equals(envKey))) keys.push(envKey)
  }
  return keys
}

function decryptPayload(key, payload) {
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const data = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

function decryptSetting(encryptedValue, masterHex) {
  const payload = Buffer.from(encryptedValue, 'base64')
  for (const key of masterKeyFromEnvOrRow(masterHex)) {
    try {
      return decryptPayload(key, payload)
    }
    catch {
      // try next key candidate
    }
  }
  return null
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
  const masterHex = byKey.get(APP_CONFIG_KEYS.masterKey)?.value?.hex
  const smtpRow = byKey.get(APP_CONFIG_KEYS.smtp)
  if (smtpRow?.encrypted_value) {
    const decrypted = decryptSetting(smtpRow.encrypted_value, masterHex)
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
  const masterHex = byKey.get(APP_CONFIG_KEYS.masterKey)?.value?.hex
  const imapRow = byKey.get(APP_CONFIG_KEYS.imap)
  if (imapRow?.encrypted_value) {
    const decrypted = decryptSetting(imapRow.encrypted_value, masterHex)
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
