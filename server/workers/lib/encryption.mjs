// AES-256-GCM decrypt for worker containers — mirrors encryption.service.ts.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

let _masterKeyOverride = null

/** @param {string} hex */
export function configureMasterKey(hex) {
  _masterKeyOverride = hex?.trim() || null
}

function masterKeyCandidates() {
  const override = _masterKeyOverride?.trim() || null
  const env = process.env.ENCRYPTION_MASTER_KEY?.trim() || null
  return [...new Set([override, env].filter(Boolean))]
}

function normalizeKeyMaterial(raw) {
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  return createHash('sha256').update(raw).digest()
}

function decryptWithKey(key, payload) {
  if (payload.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Encrypted payload is too short')
  }
  const iv = payload.subarray(0, IV_BYTES)
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const data = payload.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

/** Load DB/UI master key so secrets decrypt after redeploy without re-saving. */
export async function hydrateMasterKeyFromDb(pool) {
  if (_masterKeyOverride) return
  const { rows } = await pool.query(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    ['security.master_key'],
  )
  const hex = rows[0]?.value?.hex?.trim()
  if (hex) configureMasterKey(hex)
}

/** @param {Buffer} plain */
export function encryptBuffer(plain) {
  const keys = masterKeyCandidates()
  if (!keys.length) throw new Error('ENCRYPTION_MASTER_KEY is not configured')
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, normalizeKeyMaterial(keys[0]), iv)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted])
}

/** @param {Buffer} payload */
export function decryptBuffer(payload) {
  const keys = masterKeyCandidates()
  if (!keys.length) throw new Error('ENCRYPTION_MASTER_KEY is not configured')
  let lastError
  for (const raw of keys) {
    try {
      return decryptWithKey(normalizeKeyMaterial(raw), payload)
    }
    catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Decryption failed')
}

/** @param {Buffer} data */
export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex')
}
