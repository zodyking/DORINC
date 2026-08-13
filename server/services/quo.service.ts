import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { appSettings } from '../db/schema/settings'
import { normalizePhoneE164 } from '../../shared/format/phone-e164'
import type { QuoSettingsPatch, QuoSettingsView } from '../../shared/validators/quo'
import { encryptBuffer, decryptBuffer } from './encryption.service'
import { ensureEncryptionReadyForSettings } from './app-config.service'

export const QUO_SETTINGS_KEY = 'quo.config'

export interface QuoConfig {
  enabled: boolean
  apiKey: string
  fromNumber: string
  /** Quo webhook id (numeric string) for inbound Susan SMS. */
  webhookId: string
  /** Signing secret `whsec_...` from Quo create-webhook response. */
  webhookKey: string
  /** Absolute HTTPS URL registered with Quo. */
  webhookUrl: string
}

const DEFAULT_CONFIG: QuoConfig = {
  enabled: false,
  apiKey: '',
  fromNumber: '',
  webhookId: '',
  webhookKey: '',
  webhookUrl: '',
}

export const QUO_API_VERSION = '2026-03-30'

let cache: QuoConfig | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 15_000

function toView(config: QuoConfig): QuoSettingsView {
  const hasApiKey = Boolean(config.apiKey?.trim())
  const fromNumber = normalizePhoneE164(config.fromNumber) ?? (config.fromNumber?.trim() || null)
  const webhookConfigured = Boolean(config.webhookId?.trim() && config.webhookKey?.trim())
  return {
    enabled: Boolean(config.enabled) && hasApiKey && Boolean(fromNumber),
    hasApiKey,
    fromNumber,
    configured: hasApiKey && Boolean(fromNumber),
    webhookConfigured,
    webhookUrl: config.webhookUrl?.trim() || null,
  }
}

/** True only when Quo is configured AND explicitly enabled. */
export function isQuoSmsEnabled(config: QuoConfig | QuoSettingsView | null | undefined): boolean {
  if (!config) return false
  if ('configured' in config) return Boolean(config.enabled && config.configured)
  return Boolean(config.enabled && config.apiKey?.trim() && (normalizePhoneE164(config.fromNumber) || config.fromNumber?.trim()))
}

async function readEncryptedConfig(db: Db): Promise<QuoConfig> {
  const [row] = await db.select()
    .from(appSettings)
    .where(eq(appSettings.key, QUO_SETTINGS_KEY))
    .limit(1)
  if (!row?.encryptedValue) return { ...DEFAULT_CONFIG }

  try {
    await ensureEncryptionReadyForSettings(db)
    const raw = decryptBuffer(Buffer.from(row.encryptedValue, 'base64')).toString('utf8')
    const parsed = JSON.parse(raw) as Partial<QuoConfig>
    return {
      enabled: Boolean(parsed.enabled),
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      fromNumber: typeof parsed.fromNumber === 'string' ? parsed.fromNumber : '',
      webhookId: typeof parsed.webhookId === 'string' ? parsed.webhookId : '',
      webhookKey: typeof parsed.webhookKey === 'string' ? parsed.webhookKey : '',
      webhookUrl: typeof parsed.webhookUrl === 'string' ? parsed.webhookUrl : '',
    }
  }
  catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function refreshQuoConfigCache(db: Db): Promise<QuoConfig> {
  cache = await readEncryptedConfig(db)
  cacheLoadedAt = Date.now()
  return cache
}

export async function getQuoConfig(db: Db): Promise<QuoConfig> {
  if (!cache || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await refreshQuoConfigCache(db)
  }
  return cache ?? { ...DEFAULT_CONFIG }
}

export function getCachedQuoConfig(): QuoConfig {
  return cache ?? { ...DEFAULT_CONFIG }
}

export async function getQuoSettingsView(db: Db): Promise<QuoSettingsView> {
  const config = await getQuoConfig(db)
  return toView(config)
}

export async function isQuoEnabled(db: Db): Promise<boolean> {
  // Prefer a fresh read when cache is empty; settings saves refresh the cache explicitly.
  const view = await getQuoSettingsView(db)
  return isQuoSmsEnabled(view)
}

export async function saveQuoSettings(
  db: Db,
  patch: QuoSettingsPatch,
  actorId: string | null,
): Promise<QuoSettingsView> {
  const current = await getQuoConfig(db)
  const next: QuoConfig = {
    enabled: patch.enabled !== undefined ? patch.enabled : current.enabled,
    apiKey: patch.apiKey !== undefined ? patch.apiKey.trim() : current.apiKey,
    fromNumber: patch.fromNumber !== undefined
      ? (normalizePhoneE164(patch.fromNumber) ?? patch.fromNumber.trim())
      : current.fromNumber,
    webhookId: current.webhookId,
    webhookKey: current.webhookKey,
    webhookUrl: current.webhookUrl,
  }

  // Cannot enable without credentials.
  if (next.enabled && (!next.apiKey || !next.fromNumber)) {
    next.enabled = false
  }

  await persistQuoConfig(db, next, actorId)

  if (next.enabled && next.apiKey && next.fromNumber) {
    try {
      await ensureQuoInboundWebhook(db, actorId)
    }
    catch (err) {
      console.warn(
        '[quo] inbound webhook ensure failed:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  return getQuoSettingsView(db)
}

async function persistQuoConfig(db: Db, next: QuoConfig, actorId: string | null) {
  await ensureEncryptionReadyForSettings(db)
  const encryptedValue = encryptBuffer(Buffer.from(JSON.stringify(next), 'utf8')).toString('base64')

  const [existing] = await db.select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.key, QUO_SETTINGS_KEY))
    .limit(1)

  if (existing) {
    await db.update(appSettings).set({
      encryptedValue,
      value: {
        enabled: next.enabled,
        fromNumber: next.fromNumber,
        webhookId: next.webhookId || null,
        webhookUrl: next.webhookUrl || null,
      },
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(eq(appSettings.key, QUO_SETTINGS_KEY))
  }
  else {
    await db.insert(appSettings).values({
      key: QUO_SETTINGS_KEY,
      value: {
        enabled: next.enabled,
        fromNumber: next.fromNumber,
        webhookId: next.webhookId || null,
        webhookUrl: next.webhookUrl || null,
      },
      encryptedValue,
      updatedBy: actorId,
    })
  }

  cache = next
  cacheLoadedAt = Date.now()
}

export const QUO_API_BASE = 'https://api.quo.com'

export class QuoApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'QuoApiError'
  }
}

export const QUO_FETCH_TIMEOUT_MS = 8_000

export async function quoFetch<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
  opts: { apiVersion?: string } = {},
): Promise<T> {
  const res = await fetch(`${QUO_API_BASE}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(QUO_FETCH_TIMEOUT_MS),
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
      ...(opts.apiVersion ? { 'Quo-Api-Version': opts.apiVersion } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = text ? JSON.parse(text) : null
  }
  catch {
    parsed = { message: text }
  }
  if (!res.ok) {
    const msg = typeof parsed === 'object' && parsed && 'message' in parsed
      ? String((parsed as { message: unknown }).message)
      : `Quo API error (${res.status})`
    throw new QuoApiError(res.status, msg)
  }
  return parsed as T
}

export interface QuoPhoneNumber {
  id: string
  number: string
  formattedNumber?: string | null
  name?: string | null
}

export async function listQuoPhoneNumbers(apiKey: string): Promise<QuoPhoneNumber[]> {
  const res = await quoFetch<{ data?: Array<Record<string, unknown>> }>(apiKey, '/v1/phone-numbers')
  const rows = Array.isArray(res?.data) ? res.data : []
  return rows.map((row) => {
    const id = String(row.id ?? '')
    const number = String(row.number ?? row.phoneNumber ?? '')
    return {
      id,
      number,
      formattedNumber: row.formattedNumber != null ? String(row.formattedNumber) : null,
      name: row.name != null ? String(row.name) : null,
    }
  }).filter(r => r.id || r.number)
}

export async function sendQuoSms(input: {
  apiKey: string
  from: string
  to: string
  content: string
}): Promise<{ id: string | null }> {
  const to = normalizePhoneE164(input.to)
  const from = normalizePhoneE164(input.from) ?? input.from.trim()
  if (!to) throw new QuoApiError(400, 'Invalid destination phone number')
  if (!from) throw new QuoApiError(400, 'Quo from number is not configured')
  const content = input.content.trim()
  if (!content) throw new QuoApiError(400, 'SMS body is empty')

  const res = await quoFetch<{ data?: { id?: string }, id?: string }>(input.apiKey, '/v1/messages', {
    method: 'POST',
    body: JSON.stringify({
      content: content.slice(0, 1600),
      from,
      to: [to],
    }),
  })
  return { id: res?.data?.id ?? res?.id ?? null }
}

async function deleteQuoWebhook(apiKey: string, webhookId: string) {
  if (!webhookId) return
  try {
    await quoFetch(apiKey, `/webhooks/${webhookId}`, {
      method: 'DELETE',
    }, { apiVersion: QUO_API_VERSION })
  }
  catch (err) {
    console.warn(
      '[quo] failed to delete webhook:',
      webhookId,
      err instanceof Error ? err.message : err,
    )
  }
}

/** Register (or refresh) the inbound message.received webhook used for Susan SMS chat. */
export async function ensureQuoInboundWebhook(
  db: Db,
  actorId: string | null = null,
  opts: { force?: boolean } = {},
): Promise<QuoSettingsView> {
  const config = await getQuoConfig(db)
  if (!config.apiKey?.trim()) {
    throw new QuoApiError(400, 'Quo API key is not saved')
  }

  const { getAppUrl } = await import('./app-config.service')
  const { resolveEmailBrand } = await import('./email-branding.service')
  const brand = await resolveEmailBrand(db)
  const appUrl = (brand.appUrl || getAppUrl()).replace(/\/$/, '')
  const webhookUrl = `${appUrl}/api/public/quo-webhook`

  if (
    !opts.force
    && config.webhookId
    && config.webhookKey
    && config.webhookUrl === webhookUrl
  ) {
    return toView(config)
  }

  // Recreate when forced, URL changed, or signing key was lost.
  if (config.webhookId) {
    await deleteQuoWebhook(config.apiKey, config.webhookId)
  }

  let created: { data?: { id?: string, key?: string, url?: string } }
  try {
    created = await quoFetch<{
      data?: { id?: string, key?: string, url?: string }
    }>(config.apiKey, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        url: webhookUrl,
        events: ['message.received'],
        resourceIds: ['*'],
        status: 'enabled',
        label: 'DORINC Susan SMS',
      }),
    }, { apiVersion: QUO_API_VERSION })
  }
  catch (err) {
    // If Quo still has a webhook on this URL, list and replace it.
    console.warn(
      '[quo] webhook create failed, trying list/replace:',
      err instanceof Error ? err.message : err,
    )
    const listed = await quoFetch<{
      data?: Array<{ id?: string, url?: string }>
    }>(config.apiKey, '/webhooks', {}, { apiVersion: QUO_API_VERSION })
    const rows = Array.isArray(listed?.data) ? listed.data : []
    for (const row of rows) {
      if (String(row.url ?? '').replace(/\/$/, '') === webhookUrl.replace(/\/$/, '') && row.id) {
        await deleteQuoWebhook(config.apiKey, String(row.id))
      }
    }
    created = await quoFetch<{
      data?: { id?: string, key?: string, url?: string }
    }>(config.apiKey, '/webhooks', {
      method: 'POST',
      body: JSON.stringify({
        url: webhookUrl,
        events: ['message.received'],
        resourceIds: ['*'],
        status: 'enabled',
        label: 'DORINC Susan SMS',
      }),
    }, { apiVersion: QUO_API_VERSION })
  }

  const id = String(created?.data?.id ?? '').trim()
  const key = String(created?.data?.key ?? '').trim()
  if (!id || !key) {
    throw new QuoApiError(502, 'Quo webhook create response missing id/key')
  }

  const next: QuoConfig = {
    ...config,
    webhookId: id,
    webhookKey: key,
    webhookUrl,
  }
  await persistQuoConfig(db, next, actorId)
  console.info('[quo] inbound webhook ready', { id, webhookUrl })
  return toView(next)
}

export function verifyQuoWebhookSignature(input: {
  webhookKey: string
  webhookId: string
  webhookTimestamp: string
  webhookSignature: string
  rawBody: string
  maxAgeSeconds?: number
}): boolean {
  const secret = input.webhookKey.trim()
  if (!secret || !input.webhookId || !input.webhookTimestamp || !input.webhookSignature) {
    return false
  }

  const timestamp = Number(input.webhookTimestamp)
  const now = Math.floor(Date.now() / 1000)
  const maxAge = input.maxAgeSeconds ?? 5 * 60
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > maxAge) {
    return false
  }

  const secretBase64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  let secretBytes: Buffer
  try {
    secretBytes = Buffer.from(secretBase64, 'base64')
  }
  catch {
    return false
  }

  const signedContent = `${input.webhookId}.${input.webhookTimestamp}.${input.rawBody}`
  const expectedSignature = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64')

  const provided = input.webhookSignature
    .split(' ')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [version, signature] = entry.split(',')
      return version === 'v1' ? signature : undefined
    })
    .filter((signature): signature is string => Boolean(signature))

  return provided.some((signature) => {
    const left = Buffer.from(signature)
    const right = Buffer.from(expectedSignature)
    return left.length === right.length && crypto.timingSafeEqual(left, right)
  })
}

export async function testQuoConnection(db: Db): Promise<{
  ok: boolean
  phoneCount: number
  fromNumber: string | null
  phoneNumbers: QuoPhoneNumber[]
  message: string
}> {
  const config = await getQuoConfig(db)
  const fromNumber = normalizePhoneE164(config.fromNumber) ?? (config.fromNumber || null)
  if (!config.apiKey) {
    return {
      ok: false,
      phoneCount: 0,
      fromNumber,
      phoneNumbers: [],
      message: 'API key is not saved',
    }
  }
  try {
    const numbers = await listQuoPhoneNumbers(config.apiKey)
    return {
      ok: true,
      phoneCount: numbers.length,
      fromNumber,
      phoneNumbers: numbers,
      message: numbers.length
        ? `Connected — ${numbers.length} Quo number${numbers.length === 1 ? '' : 's'} found`
        : 'Connected — no phone numbers on this workspace yet',
    }
  }
  catch (err) {
    return {
      ok: false,
      phoneCount: 0,
      fromNumber,
      phoneNumbers: [],
      message: err instanceof Error ? err.message : 'Quo connection failed',
    }
  }
}
