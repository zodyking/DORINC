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
}

const DEFAULT_CONFIG: QuoConfig = {
  enabled: false,
  apiKey: '',
  fromNumber: '',
}

let cache: QuoConfig | null = null

function toView(config: QuoConfig): QuoSettingsView {
  const hasApiKey = Boolean(config.apiKey?.trim())
  const fromNumber = normalizePhoneE164(config.fromNumber) ?? (config.fromNumber?.trim() || null)
  return {
    enabled: Boolean(config.enabled) && hasApiKey && Boolean(fromNumber),
    hasApiKey,
    fromNumber,
    configured: hasApiKey && Boolean(fromNumber),
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
    }
  }
  catch {
    return { ...DEFAULT_CONFIG }
  }
}

export async function refreshQuoConfigCache(db: Db): Promise<QuoConfig> {
  cache = await readEncryptedConfig(db)
  return cache
}

export async function getQuoConfig(db: Db): Promise<QuoConfig> {
  if (!cache) await refreshQuoConfigCache(db)
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
  }

  // Cannot enable without credentials.
  if (next.enabled && (!next.apiKey || !next.fromNumber)) {
    next.enabled = false
  }

  await ensureEncryptionReadyForSettings(db)
  const encryptedValue = encryptBuffer(Buffer.from(JSON.stringify(next), 'utf8')).toString('base64')

  const [existing] = await db.select({ id: appSettings.id })
    .from(appSettings)
    .where(eq(appSettings.key, QUO_SETTINGS_KEY))
    .limit(1)

  if (existing) {
    await db.update(appSettings).set({
      encryptedValue,
      updatedBy: actorId,
      updatedAt: new Date(),
    }).where(eq(appSettings.key, QUO_SETTINGS_KEY))
  }
  else {
    await db.insert(appSettings).values({
      key: QUO_SETTINGS_KEY,
      value: { enabled: next.enabled, fromNumber: next.fromNumber },
      encryptedValue,
      updatedBy: actorId,
    })
  }

  cache = next
  return toView(next)
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

export async function quoFetch<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${QUO_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      Accept: 'application/json',
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

export async function testQuoConnection(db: Db): Promise<{
  ok: boolean
  phoneCount: number
  fromNumber: string | null
  message: string
}> {
  const config = await getQuoConfig(db)
  if (!config.apiKey) {
    return { ok: false, phoneCount: 0, fromNumber: null, message: 'API key is not saved' }
  }
  try {
    const numbers = await listQuoPhoneNumbers(config.apiKey)
    return {
      ok: true,
      phoneCount: numbers.length,
      fromNumber: normalizePhoneE164(config.fromNumber) ?? (config.fromNumber || null),
      message: numbers.length
        ? `Connected — ${numbers.length} Quo number${numbers.length === 1 ? '' : 's'} found`
        : 'Connected — no phone numbers on this workspace yet',
    }
  }
  catch (err) {
    return {
      ok: false,
      phoneCount: 0,
      fromNumber: normalizePhoneE164(config.fromNumber) ?? (config.fromNumber || null),
      message: err instanceof Error ? err.message : 'Quo connection failed',
    }
  }
}
