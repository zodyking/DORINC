import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearMasterKeyOverride,
  configureMasterKey,
  encryptBuffer,
} from '../../server/services/encryption.service'
import {
  decryptEncryptedAppSetting,
  getGoogleOAuthClientConfig,
  isGoogleOAuthEnvLocked,
  isSmtpEnvLocked,
} from '../../server/services/app-config.service'

describe('app-config deploy persistence', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    clearMasterKeyOverride()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    clearMasterKeyOverride()
  })

  it('does not lock SMTP saves when env only has host and from without password', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com'
    process.env.SMTP_FROM = 'shop@example.com'
    delete process.env.SMTP_PASS
    delete process.env.SMTP_FORCE_ENV

    expect(isSmtpEnvLocked()).toBe(false)
  })

  it('locks SMTP saves when env provides a complete override', () => {
    process.env.SMTP_HOST = 'smtp.gmail.com'
    process.env.SMTP_FROM = 'shop@example.com'
    process.env.SMTP_PASS = 'app-password'

    expect(isSmtpEnvLocked()).toBe(true)
  })

  it('decrypts with database master key when env master key is wrong', () => {
    const dbHex = 'a'.repeat(64)
    process.env.ENCRYPTION_MASTER_KEY = 'b'.repeat(64)

    configureMasterKey(dbHex)
    const encrypted = encryptBuffer(Buffer.from(JSON.stringify({
      host: 'smtp.test.local',
      port: 587,
      user: 'u',
      pass: 'p',
      from: 'Shop <u@test.local>',
    }), 'utf8')).toString('base64')

    const decrypted = decryptEncryptedAppSetting(encrypted, dbHex)
    expect(decrypted?.toString('utf8')).toContain('smtp.test.local')
  })

  it('locks Google OAuth UI when env credentials are present', () => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_OAUTH_FORCE_ENV
    expect(isGoogleOAuthEnvLocked()).toBe(false)

    process.env.GOOGLE_CLIENT_ID = 'client.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'secret'
    expect(isGoogleOAuthEnvLocked()).toBe(true)
    expect(getGoogleOAuthClientConfig()?.clientId).toContain('googleusercontent')
  })
})
