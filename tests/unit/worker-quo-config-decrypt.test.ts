import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { configureMasterKey } from '../../server/workers/lib/encryption.mjs'
import { loadQuoConfig } from '../../server/workers/lib/app-config.mjs'

function encryptJson(masterRaw: string, value: unknown) {
  const key = /^[0-9a-f]{64}$/i.test(masterRaw)
    ? Buffer.from(masterRaw, 'hex')
    : createHash('sha256').update(masterRaw).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

describe('worker loadQuoConfig', () => {
  afterEach(() => {
    configureMasterKey('')
    delete process.env.ENCRYPTION_MASTER_KEY
  })

  it('decrypts Quo settings when the DB master key is a passphrase (not hex)', async () => {
    const passphrase = 'ui-master-passphrase-not-hex'
    const encrypted = encryptJson(passphrase, {
      enabled: true,
      apiKey: 'sk_test_123',
      fromNumber: '+12125550100',
    })

    const pool = {
      query: async (sql: string) => {
        const text = String(sql)
        if (text.includes('SELECT value FROM app_settings WHERE key = $1')) {
          return { rows: [{ value: { hex: passphrase } }] }
        }
        if (text.includes('FROM app_settings WHERE key = ANY')) {
          return {
            rows: [
              { key: 'security.master_key', value: { hex: passphrase }, encrypted_value: null },
              { key: 'quo.config', value: null, encrypted_value: encrypted },
            ],
          }
        }
        throw new Error(`Unhandled query: ${text}`)
      },
    }

    const config = await loadQuoConfig(pool)
    expect(config).toEqual({
      enabled: true,
      apiKey: 'sk_test_123',
      fromNumber: '+12125550100',
    })
  })
})
