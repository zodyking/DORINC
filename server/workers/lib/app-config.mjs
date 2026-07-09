import { createDecipheriv, createHash } from 'node:crypto'

const APP_CONFIG_KEYS = {
  masterKey: 'security.master_key',
  smtp: 'smtp.config',
}

function masterKeyFromEnvOrRow(masterHex) {
  const env = process.env.ENCRYPTION_MASTER_KEY?.trim()
  if (env) {
    if (/^[0-9a-f]{64}$/i.test(env)) return Buffer.from(env, 'hex')
    return createHash('sha256').update(env).digest()
  }
  if (masterHex && /^[0-9a-f]{64}$/i.test(masterHex)) return Buffer.from(masterHex, 'hex')
  return null
}

function decryptPayload(key, payload) {
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const data = payload.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

/**
 * Load SMTP config from app_settings (UI setup) with env fallback.
 * @param {import('pg').Pool} pool
 */
export async function loadSmtpConfig(pool) {
  const envHost = process.env.SMTP_HOST?.trim()
  const envFrom = process.env.SMTP_FROM?.trim()
  if (envHost && envFrom) {
    return {
      host: envHost,
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER?.trim() ?? '',
      pass: process.env.SMTP_PASS ?? '',
      from: envFrom,
    }
  }

  const { rows } = await pool.query(
    `SELECT key, value, encrypted_value FROM app_settings WHERE key = ANY($1)`,
    [[APP_CONFIG_KEYS.masterKey, APP_CONFIG_KEYS.smtp]],
  )

  const byKey = new Map(rows.map(r => [r.key, r]))
  const masterHex = byKey.get(APP_CONFIG_KEYS.masterKey)?.value?.hex
  const smtpRow = byKey.get(APP_CONFIG_KEYS.smtp)
  if (!smtpRow?.encrypted_value) return null

  const key = masterKeyFromEnvOrRow(masterHex)
  if (!key) return null

  const payload = Buffer.from(smtpRow.encrypted_value, 'base64')
  const json = JSON.parse(decryptPayload(key, payload).toString('utf8'))
  return {
    host: json.host,
    port: Number(json.port ?? 587),
    user: json.user ?? '',
    pass: json.pass ?? '',
    from: json.from,
  }
}
