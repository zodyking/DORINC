import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

let _masterKeyHexOverride: string | null = null

/** Set master key from app_settings (UI setup). Env var still takes precedence in masterKey(). */
export function configureMasterKey(hex: string): void {
  _masterKeyHexOverride = hex.trim()
}

function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_MASTER_KEY?.trim() || _masterKeyHexOverride
  if (!raw) {
    throw new Error('ENCRYPTION_MASTER_KEY is not configured')
  }
  // Accept 64-char hex or arbitrary passphrase (hashed to 32 bytes).
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw).digest()
}

/** AES-256-GCM encrypt — returns iv + auth tag + ciphertext. */
export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, masterKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted])
}

/** Decrypt payload produced by encryptBuffer. */
export function decryptBuffer(payload: Buffer): Buffer {
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

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}
