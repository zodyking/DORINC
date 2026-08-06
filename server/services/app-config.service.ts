import { eq, sql } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import type { Db } from '../db/client'
import { appSettings } from '../db/schema/settings'
import { aiProviderSettings } from '../db/schema/ai'
import {
  configureMasterKey,
  decryptBuffer,
  encryptBuffer,
} from './encryption.service'
import { hasDatabaseConfig } from './runtime-config.service'

/** Setting keys stored in `app_settings` (UI-first config; env vars are optional overrides). */
export const APP_CONFIG_KEYS = {
  masterKey: 'security.master_key',
  sessionSecret: 'security.session_secret',
  appUrl: 'app.url',
  maxUploadMb: 'app.max_upload_mb',
  smtp: 'smtp.config',
  notifyEmail: 'app.notify_email',
  /** Google OAuth client for Drive backup offsite copies. */
  googleOAuth: 'google.oauth',
} as const

export interface SmtpConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

export interface GoogleOAuthClientConfig {
  clientId: string
  clientSecret: string
}

export interface SetupProgress {
  database: boolean
  smtp: boolean
  security: boolean
  ai: boolean
}

interface CachedConfig {
  masterKeyHex: string | null
  sessionSecretHex: string | null
  appUrl: string | null
  maxUploadMb: number | null
  smtp: SmtpConfig | null
  notifyEmail: string | null
  googleOAuth: GoogleOAuthClientConfig | null
}

let cache: CachedConfig = {
  masterKeyHex: null,
  sessionSecretHex: null,
  appUrl: null,
  maxUploadMb: null,
  smtp: null,
  notifyEmail: null,
  googleOAuth: null,
}

function hexKey(bytes = 32): string {
  return randomBytes(bytes).toString('hex')
}

function envMasterKey(): string | null {
  const raw = process.env.ENCRYPTION_MASTER_KEY?.trim()
  return raw || null
}

function envSessionSecret(): string | null {
  const raw = process.env.SESSION_SECRET?.trim()
  return raw || null
}

function envAppUrl(): string | null {
  const raw = process.env.APP_URL?.trim()
  return raw || null
}

function envMaxUploadMb(): number | null {
  const raw = process.env.MAX_UPLOAD_MB?.trim()
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function envSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim()
  const from = process.env.SMTP_FROM?.trim()
  if (!host || !from) return null
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER?.trim() ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from,
  }
}

function envGoogleOAuthConfig(): GoogleOAuthClientConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

function parseGoogleOAuthPayload(payload: Buffer): GoogleOAuthClientConfig {
  const parsed = JSON.parse(payload.toString('utf8')) as GoogleOAuthClientConfig
  if (!parsed.clientId?.trim() || !parsed.clientSecret?.trim()) {
    throw new Error('Invalid Google OAuth config payload')
  }
  return {
    clientId: parsed.clientId.trim(),
    clientSecret: parsed.clientSecret.trim(),
  }
}

function decryptWithMasterKeys(
  encryptedB64: string,
  dbMasterHex: string | null,
  envKey: string | null,
): Buffer | null {
  const keys = [...new Set([dbMasterHex, envKey].filter(Boolean))] as string[]
  for (const keyHex of keys) {
    try {
      configureMasterKey(keyHex)
      return decryptBuffer(Buffer.from(encryptedB64, 'base64'))
    }
    catch {
      // try next key candidate
    }
  }
  if (keys.length) {
    console.warn('[app-config] could not decrypt encrypted app setting (master key mismatch)')
  }
  return null
}

/** True when env must override UI-managed SMTP (complete env config or explicit force flag). */
export function isSmtpEnvLocked(): boolean {
  if (process.env.SMTP_FORCE_ENV === 'true') return true
  const env = envSmtpConfig()
  return !!(env?.host && env.from && env.pass)
}

/** True when env supplies Google OAuth client credentials (UI save is ignored). */
export function isGoogleOAuthEnvLocked(): boolean {
  if (process.env.GOOGLE_OAUTH_FORCE_ENV === 'true') return true
  return !!envGoogleOAuthConfig()
}

export function decryptEncryptedAppSetting(
  encryptedB64: string,
  dbMasterHex: string | null,
): Buffer | null {
  return decryptWithMasterKeys(encryptedB64, dbMasterHex, envMasterKey())
}

async function readSetting(db: Db, key: string) {
  const [row] = await db.select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1)
  return row ?? null
}

async function upsertSetting(
  db: Db,
  key: string,
  data: { value?: unknown, encryptedValue?: string | null, updatedBy?: string | null },
) {
  const existing = await readSetting(db, key)
  if (existing) {
    await db.update(appSettings)
      .set({
        value: data.value !== undefined ? data.value : existing.value,
        encryptedValue: data.encryptedValue !== undefined ? data.encryptedValue : existing.encryptedValue,
        updatedBy: data.updatedBy ?? existing.updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.key, key))
  }
  else {
    await db.insert(appSettings).values({
      key,
      value: data.value ?? null,
      encryptedValue: data.encryptedValue ?? null,
      updatedBy: data.updatedBy ?? null,
    })
  }
}

function parseSmtpPayload(payload: Buffer): SmtpConfig {
  const parsed = JSON.parse(payload.toString('utf8')) as SmtpConfig
  if (!parsed.host?.trim() || !parsed.from?.trim()) {
    throw new Error('Invalid SMTP config payload')
  }
  return {
    host: parsed.host.trim(),
    port: Number(parsed.port ?? 587),
    user: parsed.user?.trim() ?? '',
    pass: parsed.pass ?? '',
    from: parsed.from.trim(),
  }
}

/** Load DB settings into memory (env overrides remain authoritative at read time). */
export async function refreshAppConfigCache(db: Db): Promise<void> {
  const rows = await db.select().from(appSettings)
  const byKey = new Map(rows.map(r => [r.key, r]))

  const masterRow = byKey.get(APP_CONFIG_KEYS.masterKey)
  const masterHex = (masterRow?.value as { hex?: string } | null)?.hex?.trim() || null

  const sessionRow = byKey.get(APP_CONFIG_KEYS.sessionSecret)
  const sessionHex = (sessionRow?.value as { hex?: string } | null)?.hex?.trim() || null

  const urlRow = byKey.get(APP_CONFIG_KEYS.appUrl)
  const appUrl = (urlRow?.value as { url?: string } | null)?.url?.trim() || null

  const uploadRow = byKey.get(APP_CONFIG_KEYS.maxUploadMb)
  const mbRaw = (uploadRow?.value as { mb?: number } | null)?.mb
  const maxUploadMb = typeof mbRaw === 'number' && mbRaw > 0 ? mbRaw : null

  const notifyRow = byKey.get(APP_CONFIG_KEYS.notifyEmail)
  const notifyEmail = (notifyRow?.value as { email?: string } | null)?.email?.trim() || null

  let smtp: SmtpConfig | null = null
  const smtpRow = byKey.get(APP_CONFIG_KEYS.smtp)
  if (smtpRow?.encryptedValue) {
    const decrypted = decryptWithMasterKeys(smtpRow.encryptedValue, masterHex, envMasterKey())
    if (decrypted) {
      try {
        smtp = parseSmtpPayload(decrypted)
      }
      catch {
        console.warn('[app-config] SMTP config payload in database is invalid')
        smtp = null
      }
    }
  }

  let googleOAuth: GoogleOAuthClientConfig | null = null
  const googleRow = byKey.get(APP_CONFIG_KEYS.googleOAuth)
  if (googleRow?.encryptedValue) {
    const decrypted = decryptWithMasterKeys(googleRow.encryptedValue, masterHex, envMasterKey())
    if (decrypted) {
      try {
        googleOAuth = parseGoogleOAuthPayload(decrypted)
      }
      catch {
        console.warn('[app-config] Google OAuth config payload in database is invalid')
        googleOAuth = null
      }
    }
  }

  cache = {
    masterKeyHex: masterHex,
    sessionSecretHex: sessionHex,
    appUrl,
    maxUploadMb,
    smtp,
    notifyEmail,
    googleOAuth,
  }

  const effectiveMaster = masterHex ?? envMasterKey()
  if (effectiveMaster) configureMasterKey(effectiveMaster)
}

export function getMasterKeyHex(): string | null {
  return cache.masterKeyHex ?? envMasterKey()
}

export function getSessionSecret(): string | null {
  return envSessionSecret() ?? cache.sessionSecretHex
}

/** Re-read DB settings when env is unset (e.g. boot cache warm failed). */
export async function resolveSessionSecret(db: Db): Promise<string | null> {
  const existing = getSessionSecret()
  if (existing) return existing
  await refreshAppConfigCache(db)
  return getSessionSecret()
}

/**
 * Ensure the DB/UI master key is loaded into the encryption override.
 * Always re-reads app_settings so a stale/wrong in-memory override cannot
 * shadow the DB key (which previously broke AI/billing decrypt after redeploy).
 * Never generates a new key.
 */
export async function ensureMasterKeyHydrated(db: Db): Promise<void> {
  await refreshAppConfigCache(db)
}

export function getAppUrl(): string {
  return envAppUrl() ?? cache.appUrl ?? 'http://localhost:3000'
}

export function getMaxUploadMb(): number {
  return envMaxUploadMb() ?? cache.maxUploadMb ?? 25
}

export function getSmtpConfig(): SmtpConfig | null {
  return cache.smtp ?? envSmtpConfig()
}

/** Google OAuth client credentials — env overrides UI-stored values when both are set. */
export function getGoogleOAuthClientConfig(): GoogleOAuthClientConfig | null {
  return envGoogleOAuthConfig() ?? cache.googleOAuth
}

export function getGoogleOAuthRedirectUri(): string {
  return `${getAppUrl().replace(/\/$/, '')}/api/admin/backups/google/callback`
}

export function getNotifyEmail(): string | null {
  return process.env.ADMIN_BOOTSTRAP_EMAIL?.trim()
    || cache.notifyEmail
    || null
}

export async function getSetupProgress(db: Db): Promise<SetupProgress> {
  if (!hasDatabaseConfig()) {
    return { database: false, smtp: false, security: false, ai: false }
  }

  await refreshAppConfigCache(db)

  let databaseOk = true
  try {
    await db.execute(sql`select 1`)
  }
  catch {
    databaseOk = false
  }

  const smtp = getSmtpConfig()
  const security = !!(getMasterKeyHex() && getSessionSecret() && getAppUrl())

  const [aiRow] = await db.select({ encryptedApiKey: aiProviderSettings.encryptedApiKey })
    .from(aiProviderSettings)
    .limit(1)

  return {
    database: hasDatabaseConfig() && databaseOk,
    smtp: !!(smtp?.host && smtp.from),
    security,
    ai: !!(aiRow?.encryptedApiKey && aiRow.encryptedApiKey.length > 0),
  }
}

export function isAppUrlEnvLocked(): boolean {
  return !!envAppUrl()
}

/** Auto-provision encryption keys when saving UI-managed secrets (SMTP, IMAP, etc.). */
export async function ensureEncryptionReadyForSettings(db: Db): Promise<string> {
  const masterRow = await readSetting(db, APP_CONFIG_KEYS.masterKey)
  const dbHex = (masterRow?.value as { hex?: string } | null)?.hex?.trim() || null
  const envKey = envMasterKey()

  if (dbHex) {
    configureMasterKey(dbHex)
    cache.masterKeyHex = dbHex
    return dbHex
  }

  if (envKey) {
    await upsertSetting(db, APP_CONFIG_KEYS.masterKey, { value: { hex: envKey } })
    configureMasterKey(envKey)
    cache.masterKeyHex = envKey
    return envKey
  }

  const masterKeyHex = hexKey()
  await upsertSetting(db, APP_CONFIG_KEYS.masterKey, { value: { hex: masterKeyHex } })

  if (!getSessionSecret() && !envSessionSecret()) {
    const sessionSecretHex = hexKey()
    await upsertSetting(db, APP_CONFIG_KEYS.sessionSecret, { value: { hex: sessionSecretHex } })
    cache.sessionSecretHex = sessionSecretHex
  }

  const urlRow = await readSetting(db, APP_CONFIG_KEYS.appUrl)
  if (!urlRow && !envAppUrl()) {
    await upsertSetting(db, APP_CONFIG_KEYS.appUrl, { value: { url: 'http://localhost:3000' } })
    cache.appUrl = 'http://localhost:3000'
  }

  configureMasterKey(masterKeyHex)
  cache.masterKeyHex = masterKeyHex
  return masterKeyHex
}

export async function saveSecurityConfig(
  db: Db,
  input: {
    masterKeyHex?: string
    sessionSecretHex?: string
    appUrl?: string
    maxUploadMb?: number
  },
): Promise<void> {
  if (envMasterKey() || envSessionSecret()) {
    throw new Error('Security settings are locked by environment variables')
  }

  const masterKeyHex = input.masterKeyHex?.trim() || hexKey()
  const sessionSecretHex = input.sessionSecretHex?.trim() || hexKey()
  // Dockploy sets APP_URL in env; wizard value is used only when env is absent.
  const appUrl = (envAppUrl() ?? input.appUrl ?? '').trim().replace(/\/$/, '')
  const maxUploadMb = input.maxUploadMb ?? 25

  if (!/^https?:\/\/.+/i.test(appUrl)) {
    throw new Error('APP_URL must be a valid http(s) URL')
  }
  if (!/^[0-9a-f]{64}$/i.test(masterKeyHex)) {
    throw new Error('Master key must be 64 hex characters')
  }
  if (sessionSecretHex.length < 32) {
    throw new Error('Session secret is too short')
  }

  await upsertSetting(db, APP_CONFIG_KEYS.masterKey, { value: { hex: masterKeyHex } })
  await upsertSetting(db, APP_CONFIG_KEYS.sessionSecret, { value: { hex: sessionSecretHex } })
  await upsertSetting(db, APP_CONFIG_KEYS.appUrl, { value: { url: appUrl } })
  await upsertSetting(db, APP_CONFIG_KEYS.maxUploadMb, { value: { mb: maxUploadMb } })

  configureMasterKey(masterKeyHex)
  await refreshAppConfigCache(db)
}

export async function saveSmtpConfig(db: Db, input: SmtpConfig, updatedBy?: string): Promise<void> {
  if (isSmtpEnvLocked()) {
    throw new Error('SMTP settings are locked by environment variables')
  }

  await ensureEncryptionReadyForSettings(db)

  let pass = input.pass?.trim() ?? ''
  if (!pass) {
    await refreshAppConfigCache(db)
    pass = getSmtpConfig()?.pass ?? ''
  }

  const config: SmtpConfig = {
    host: input.host.trim(),
    port: Number(input.port ?? 587),
    user: input.user.trim(),
    pass,
    from: input.from.trim(),
  }

  if (!config.host || !config.from) {
    throw new Error('SMTP host and from address are required')
  }
  if (!config.pass) {
    throw new Error('SMTP password is required')
  }

  const encrypted = encryptBuffer(Buffer.from(JSON.stringify(config), 'utf8')).toString('base64')
  await upsertSetting(db, APP_CONFIG_KEYS.smtp, { encryptedValue: encrypted, updatedBy: updatedBy ?? null })
  await refreshAppConfigCache(db)
}

export async function saveGoogleOAuthConfig(
  db: Db,
  input: { clientId: string, clientSecret?: string | null },
  updatedBy?: string,
): Promise<GoogleOAuthClientConfig> {
  if (isGoogleOAuthEnvLocked()) {
    throw new Error('Google OAuth settings are locked by environment variables')
  }

  await ensureEncryptionReadyForSettings(db)
  await refreshAppConfigCache(db)

  const existing = getGoogleOAuthClientConfig()
  const clientId = input.clientId.trim() || existing?.clientId || ''
  const clientSecret = input.clientSecret?.trim() || existing?.clientSecret || ''

  if (!clientId) throw new Error('Google Client ID is required')
  if (!clientSecret) throw new Error('Google Client Secret is required')

  const config: GoogleOAuthClientConfig = { clientId, clientSecret }
  const encrypted = encryptBuffer(Buffer.from(JSON.stringify(config), 'utf8')).toString('base64')
  await upsertSetting(db, APP_CONFIG_KEYS.googleOAuth, {
    encryptedValue: encrypted,
    updatedBy: updatedBy ?? null,
  })
  await refreshAppConfigCache(db)
  return config
}

export function generateMasterKeyHex(): string {
  return hexKey()
}

export function generateSessionSecretHex(): string {
  return hexKey()
}

export async function assertSetupRequirements(db: Db): Promise<void> {
  await refreshAppConfigCache(db)
  if (!getMasterKeyHex()) throw new Error('SETUP_INCOMPLETE: security')
  if (!getSessionSecret()) throw new Error('SETUP_INCOMPLETE: security')
  if (!getAppUrl()) throw new Error('SETUP_INCOMPLETE: security')
  const smtp = getSmtpConfig()
  if (!smtp?.host || !smtp.from) throw new Error('SETUP_INCOMPLETE: smtp')
}
