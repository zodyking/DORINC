import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearMasterKeyOverride,
  configureMasterKey,
  decryptBuffer,
  encryptBuffer,
  masterKeyMaterialCandidates,
} from '../../server/services/encryption.service'

describe('encryption master key hydration', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    clearMasterKeyOverride()
    delete process.env.ENCRYPTION_MASTER_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    clearMasterKeyOverride()
  })

  it('prefers DB/UI override over env when encrypting', () => {
    const dbHex = 'a'.repeat(64)
    const envHex = 'b'.repeat(64)
    process.env.ENCRYPTION_MASTER_KEY = envHex
    configureMasterKey(dbHex)

    expect(masterKeyMaterialCandidates()[0]).toBe(dbHex)

    const encrypted = encryptBuffer(Buffer.from('openrouter-key', 'utf8'))
    clearMasterKeyOverride()
    // Env alone cannot decrypt ciphertext sealed with the DB key.
    expect(() => decryptBuffer(encrypted)).toThrow()

    configureMasterKey(dbHex)
    expect(decryptBuffer(encrypted).toString('utf8')).toBe('openrouter-key')
  })

  it('decrypts with env fallback when override key does not match', () => {
    const envHex = 'c'.repeat(64)
    process.env.ENCRYPTION_MASTER_KEY = envHex
    clearMasterKeyOverride()

    const encrypted = encryptBuffer(Buffer.from('billing-secret', 'utf8'))

    // Wrong override first, env second — must still succeed.
    configureMasterKey('d'.repeat(64))
    expect(decryptBuffer(encrypted).toString('utf8')).toBe('billing-secret')
  })

  it('works with DB key only after restart-style configure', () => {
    const dbHex = 'e'.repeat(64)
    configureMasterKey(dbHex)
    const encrypted = encryptBuffer(Buffer.from('ai-key', 'utf8'))

    clearMasterKeyOverride()
    expect(() => decryptBuffer(encrypted)).toThrow(/ENCRYPTION_MASTER_KEY/)

    configureMasterKey(dbHex)
    expect(decryptBuffer(encrypted).toString('utf8')).toBe('ai-key')
  })
})
