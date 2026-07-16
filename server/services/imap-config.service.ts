import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appSettings } from '../db/schema/settings'
import { encryptBuffer } from './encryption.service'
import { ensureEncryptionReadyForSettings, getSmtpConfig, decryptEncryptedAppSetting, APP_CONFIG_KEYS } from './app-config.service'
import { DEFAULT_AUTO_RESPONDER_MESSAGE } from '../../shared/validators/email-inbox'

export const IMAP_CONFIG_KEY = 'imap.config'
export const IMAP_FILTERS_KEY = 'imap.filters'

export interface ImapConfig {
  host: string
  port: number
  user: string
  pass: string
  mailbox: string
  useTls: boolean
}

export interface ImapAutoResponderConfig {
  enabled: boolean
  subject: string
  message: string
}

export interface ImapFilterConfig {
  companyEmail: string
  additionalEmails: string[]
  includeCustomerEmails: boolean
  autoResponder: ImapAutoResponderConfig
}

interface CachedImap {
  config: ImapConfig | null
  filters: ImapFilterConfig | null
}

let cache: CachedImap = { config: null, filters: null }

function envImapConfig(): ImapConfig | null {
  const host = process.env.IMAP_HOST?.trim()
  const user = process.env.IMAP_USER?.trim()
  if (!host || !user) return null
  return {
    host,
    port: Number(process.env.IMAP_PORT ?? 993),
    user,
    pass: process.env.IMAP_PASS ?? '',
    mailbox: process.env.IMAP_MAILBOX?.trim() || 'INBOX',
    useTls: process.env.IMAP_TLS !== 'false',
  }
}

function parseImapPayload(payload: Buffer): ImapConfig {
  const parsed = JSON.parse(payload.toString('utf8')) as ImapConfig
  if (!parsed.host?.trim() || !parsed.user?.trim()) {
    throw new Error('Invalid IMAP config payload')
  }
  return {
    host: parsed.host.trim(),
    port: Number(parsed.port ?? 993),
    user: parsed.user.trim(),
    pass: parsed.pass ?? '',
    mailbox: parsed.mailbox?.trim() || 'INBOX',
    useTls: parsed.useTls !== false,
  }
}

function defaultAutoResponder(): ImapAutoResponderConfig {
  return {
    enabled: false,
    subject: 'We received your message',
    message: DEFAULT_AUTO_RESPONDER_MESSAGE,
  }
}

function normalizeAutoResponder(raw: Partial<ImapAutoResponderConfig> | null | undefined): ImapAutoResponderConfig {
  return {
    enabled: raw?.enabled === true,
    subject: raw?.subject?.trim() || 'We received your message',
    message: raw?.message?.trim() || DEFAULT_AUTO_RESPONDER_MESSAGE,
  }
}

function defaultFilters(): ImapFilterConfig {
  const smtp = getSmtpConfig()
  const fromMatch = smtp?.from.match(/<([^>]+)>/)
  const companyEmail = fromMatch?.[1]?.trim() || smtp?.from?.trim() || ''
  return {
    companyEmail,
    additionalEmails: [],
    includeCustomerEmails: true,
    autoResponder: defaultAutoResponder(),
  }
}

export async function refreshImapConfigCache(db: Db): Promise<void> {
  const rows = await db.select().from(appSettings)
    .where(eq(appSettings.key, IMAP_CONFIG_KEY))
  const filterRows = await db.select().from(appSettings)
    .where(eq(appSettings.key, IMAP_FILTERS_KEY))
  const masterRows = await db.select().from(appSettings)
    .where(eq(appSettings.key, APP_CONFIG_KEYS.masterKey))

  const masterHex = (masterRows[0]?.value as { hex?: string } | null)?.hex?.trim() || null

  let config: ImapConfig | null = null
  const configRow = rows[0]
  if (configRow?.encryptedValue) {
    const decrypted = decryptEncryptedAppSetting(configRow.encryptedValue, masterHex)
    if (decrypted) {
      try {
        config = parseImapPayload(decrypted)
      }
      catch {
        console.warn('[imap-config] IMAP config payload in database is invalid')
        config = null
      }
    }
  }

  let filters: ImapFilterConfig | null = null
  const filterRow = filterRows[0]
  if (filterRow?.value) {
    const raw = filterRow.value as ImapFilterConfig
    filters = {
      companyEmail: raw.companyEmail?.trim().toLowerCase() ?? '',
      additionalEmails: (raw.additionalEmails ?? []).map(e => e.trim().toLowerCase()).filter(Boolean),
      includeCustomerEmails: raw.includeCustomerEmails !== false,
      autoResponder: normalizeAutoResponder(raw.autoResponder),
    }
  }

  cache = { config, filters }
}

export function getImapConfig(): ImapConfig | null {
  return cache.config ?? envImapConfig()
}

export function getImapFilters(): ImapFilterConfig {
  return cache.filters ?? defaultFilters()
}

export function isImapEnvLocked(): boolean {
  if (process.env.IMAP_FORCE_ENV === 'true') return true
  const env = envImapConfig()
  return !!(env?.host && env.user && env.pass)
}

export async function saveImapConfig(db: Db, config: ImapConfig, actorId: string | null) {
  if (isImapEnvLocked()) throw new Error('IMAP is locked by environment variables on this server')
  await ensureEncryptionReadyForSettings(db)

  let pass = config.pass?.trim() ?? ''
  if (!pass) {
    await refreshImapConfigCache(db)
    pass = getImapConfig()?.pass ?? ''
  }
  if (!pass) throw new Error('IMAP password is required')

  const normalized: ImapConfig = { ...config, pass }
  const encryptedValue = encryptBuffer(Buffer.from(JSON.stringify(normalized), 'utf8')).toString('base64')

  const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, IMAP_CONFIG_KEY)).limit(1)
  if (existing) {
    await db.update(appSettings).set({
      encryptedValue,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(eq(appSettings.key, IMAP_CONFIG_KEY))
  }
  else {
    await db.insert(appSettings).values({
      key: IMAP_CONFIG_KEY,
      encryptedValue,
      updatedBy: actorId,
    })
  }

  cache.config = normalized
}

export async function saveImapFilters(db: Db, filters: ImapFilterConfig, actorId: string | null) {
  const normalized: ImapFilterConfig = {
    companyEmail: filters.companyEmail.trim().toLowerCase(),
    additionalEmails: filters.additionalEmails.map(e => e.trim().toLowerCase()).filter(Boolean),
    includeCustomerEmails: filters.includeCustomerEmails,
    autoResponder: normalizeAutoResponder(filters.autoResponder),
  }

  const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, IMAP_FILTERS_KEY)).limit(1)
  if (existing) {
    await db.update(appSettings).set({
      value: normalized,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(eq(appSettings.key, IMAP_FILTERS_KEY))
  }
  else {
    await db.insert(appSettings).values({
      key: IMAP_FILTERS_KEY,
      value: normalized,
      updatedBy: actorId,
    })
  }

  cache.filters = normalized
}

export function clearImapConfigCache(): void {
  cache = { config: null, filters: null }
}
