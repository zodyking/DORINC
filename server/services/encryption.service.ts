import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

let _masterKeyHexOverride: string | null = null

/**
 * Set master key from app_settings (UI / boot hydration).
 * Preferred over ENCRYPTION_MASTER_KEY for encrypt/decrypt once configured,
 * with env kept as a decrypt fallback for older ciphertext.
 */
export function configureMasterKey(hex: string): void {
  _masterKeyHexOverride = hex.trim()
}

/** Test helper — clear UI/DB override between cases. */
export function clearMasterKeyOverride(): void {
  _masterKeyHexOverride = null
}

export function getConfiguredMasterKeyOverride(): string | null {
  return _masterKeyHexOverride
}

function normalizeKeyMaterial(raw: string): Buffer {
  // Accept 64-char hex or arbitrary passphrase (hashed to 32 bytes).
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw).digest()
}

/** DB/UI override first, then env — matches boot hydration + SMTP fallback behavior. */
export function masterKeyMaterialCandidates(): string[] {
  const override = _masterKeyHexOverride?.trim() || null
  const env = process.env.ENCRYPTION_MASTER_KEY?.trim() || null
  return [...new Set([override, env].filter(Boolean))] as string[]
}

function primaryMasterKeyMaterial(): string {
  const keys = masterKeyMaterialCandidates()
  if (!keys.length) {
    throw new Error('ENCRYPTION_MASTER_KEY is not configured')
  }
  return keys[0]!
}

function decryptWithKey(key: Buffer, payload: Buffer): Buffer {
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

/** AES-256-GCM encrypt — returns iv + auth tag + ciphertext. */
export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, normalizeKeyMaterial(primaryMasterKeyMaterial()), iv)
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted])
}

/** Decrypt payload produced by encryptBuffer (tries DB/UI key, then env). */
export function decryptBuffer(payload: Buffer): Buffer {
  const keys = masterKeyMaterialCandidates()
  if (!keys.length) {
    throw new Error('ENCRYPTION_MASTER_KEY is not configured')
  }

  let lastError: unknown
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

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}
