// AES-256-GCM decrypt for worker containers — mirrors encryption.service.ts.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function masterKey() {
  const raw = process.env.ENCRYPTION_MASTER_KEY?.trim()
  if (!raw) throw new Error('ENCRYPTION_MASTER_KEY is not configured')
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  return createHash('sha256').update(raw).digest()
}

/** @param {Buffer} plain */
export function encryptBuffer(plain) {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted])
}

/** @param {Buffer} payload */
export function decryptBuffer(payload) {
  if (payload.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('Encrypted payload is too short')
  }
  const iv = payload.subarray(0, IV_BYTES)
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const data = payload.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv(ALGORITHM, masterKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

/** @param {Buffer} data */
export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex')
}
