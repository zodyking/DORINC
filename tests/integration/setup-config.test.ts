// UI-first app config — save/load from app_settings (setup wizard).
import { config } from 'dotenv'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appSettings } from '../../server/db/schema/settings'
import {
  APP_CONFIG_KEYS,
  getAppUrl,
  getMasterKeyHex,
  getSessionSecret,
  getSmtpConfig,
  refreshAppConfigCache,
  saveSecurityConfig,
  saveSmtpConfig,
} from '../../server/services/app-config.service'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const TEST_KEYS = Object.values(APP_CONFIG_KEYS)

const hadEnvSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_FROM)
const hadEnvSecurity = !!(process.env.ENCRYPTION_MASTER_KEY || process.env.SESSION_SECRET)

beforeAll(async () => {
  if (hadEnvSmtp || hadEnvSecurity) return
  await db.delete(appSettings).where(inArray(appSettings.key, TEST_KEYS))
  await refreshAppConfigCache(db)
})

afterAll(async () => {
  if (!hadEnvSmtp && !hadEnvSecurity) {
    await db.delete(appSettings).where(inArray(appSettings.key, TEST_KEYS))
  }
  await pool.end()
})

describe('app-config UI setup storage', () => {
  it('stores security + SMTP in app_settings and reads them back', async () => {
    if (hadEnvSmtp || hadEnvSecurity) {
      expect(getMasterKeyHex()).toBeTruthy()
      expect(getSmtpConfig()?.host).toBeTruthy()
      return
    }

    const masterKeyHex = 'a'.repeat(64)
    const sessionSecretHex = 'b'.repeat(64)

    await saveSecurityConfig(db, {
      masterKeyHex,
      sessionSecretHex,
      appUrl: 'http://setup-test.local',
      maxUploadMb: 25,
    })

    await saveSmtpConfig(db, {
      host: 'smtp.test.local',
      port: 587,
      user: 'mailer',
      pass: 'secret',
      from: 'DORINC <mailer@test.local>',
    })

    await refreshAppConfigCache(db)

    expect(getMasterKeyHex()).toBe(masterKeyHex)
    expect(getSessionSecret()).toBe(sessionSecretHex)
    expect(getAppUrl()).toBe('http://setup-test.local')

    const smtp = getSmtpConfig()
    expect(smtp?.host).toBe('smtp.test.local')
    expect(smtp?.from).toContain('mailer@test.local')
  })

  it('persists encrypted SMTP row in database', async () => {
    if (hadEnvSmtp || hadEnvSecurity) return

    const [row] = await db.select()
      .from(appSettings)
      .where(eq(appSettings.key, APP_CONFIG_KEYS.smtp))
      .limit(1)

    expect(row?.encryptedValue).toBeTruthy()
    expect(row?.encryptedValue).not.toContain('secret')
  })
})
