import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { Db } from '../db/client'
import { backupIntegrations } from '../db/schema/backups'
import { decryptBuffer, encryptBuffer } from './encryption.service'
import { writeAudit } from './audit.service'
import {
  ensureMasterKeyHydrated,
  getGoogleOAuthClientConfig,
  getGoogleOAuthRedirectUri,
  getSessionSecret,
  isGoogleOAuthEnvLocked,
  refreshAppConfigCache,
  saveGoogleOAuthConfig,
} from './app-config.service'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export type GoogleDriveBackupErrorCode =
  | 'NOT_CONFIGURED'
  | 'NOT_CONNECTED'
  | 'OAUTH_FAILED'
  | 'TOKEN_REFRESH_FAILED'
  | 'UPLOAD_FAILED'
  | 'TEST_FAILED'
  | 'INVALID_STATE'

export class GoogleDriveBackupError extends Error {
  constructor(public readonly code: GoogleDriveBackupErrorCode, message?: string) {
    super(message ?? code)
  }
}

interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

interface StoredGoogleTokens {
  accessToken: string
  refreshToken: string
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export interface BackupIntegrationView {
  provider: 'google_drive'
  connected: boolean
  configured: boolean
  envLocked: boolean
  hasClientSecret: boolean
  clientIdMasked: string | null
  redirectUri: string
  accountEmail: string | null
  folderId: string | null
  lastTestedAt: Date | null
  lastError: string | null
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const client = getGoogleOAuthClientConfig()
  if (!client) return null
  return {
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    redirectUri: getGoogleOAuthRedirectUri(),
  }
}

function maskClientId(clientId: string): string {
  if (clientId.length <= 12) return `${clientId.slice(0, 4)}…`
  return `${clientId.slice(0, 8)}…${clientId.slice(-4)}`
}

function signOAuthState(userId: string): string {
  const secret = getSessionSecret()
  if (!secret) throw new GoogleDriveBackupError('NOT_CONFIGURED', 'Session secret is required for OAuth')
  const nonce = randomBytes(16).toString('hex')
  const payload = `${userId}.${nonce}.${Date.now()}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}.${sig}`).toString('base64url')
}

export function verifyOAuthState(state: string, userId: string): boolean {
  const secret = getSessionSecret()
  if (!secret) return false
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8')
    const lastDot = decoded.lastIndexOf('.')
    if (lastDot < 0) return false
    const payload = decoded.slice(0, lastDot)
    const sig = decoded.slice(lastDot + 1)
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    if (sig.length !== expected.length) return false
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
    const [stateUserId, , ts] = payload.split('.')
    if (stateUserId !== userId) return false
    const age = Date.now() - Number(ts)
    return age >= 0 && age < 15 * 60 * 1000
  }
  catch {
    return false
  }
}

export function buildGoogleAuthUrl(userId: string): string {
  const config = getGoogleOAuthConfig()
  if (!config) {
    throw new GoogleDriveBackupError(
      'NOT_CONFIGURED',
      'Save Google Client ID and Client Secret in Backup settings, or set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET',
    )
  }
  const state = signOAuthState(userId)
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export async function saveGoogleDriveOAuthCredentials(
  db: Db,
  input: { clientId: string, clientSecret?: string | null },
  actorId: string,
  event: H3Event | null = null,
): Promise<BackupIntegrationView> {
  try {
    await saveGoogleOAuthConfig(db, input, actorId)
  }
  catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save Google OAuth credentials'
    if (message.includes('locked by environment')) {
      throw new GoogleDriveBackupError('NOT_CONFIGURED', message)
    }
    throw new GoogleDriveBackupError('OAUTH_FAILED', message)
  }

  const integration = await ensureBackupIntegration(db)
  const saved = getGoogleOAuthConfig()
  await writeAudit(event, {
    entityType: 'backup',
    entityId: integration.id,
    action: 'backup.google_drive.credentials_saved',
    afterData: { clientIdMasked: saved ? maskClientId(saved.clientId) : null },
    permissionKey: 'backups.manage.all',
    riskLevel: 'sensitive',
  })

  return getBackupIntegrationView(db)
}

async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  const config = getGoogleOAuthConfig()
  if (!config) throw new GoogleDriveBackupError('NOT_CONFIGURED')

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const payload = await res.json() as GoogleTokenResponse & { error?: string, error_description?: string }
  if (!res.ok || !payload.access_token) {
    throw new GoogleDriveBackupError('OAUTH_FAILED', payload.error_description ?? payload.error ?? 'OAuth exchange failed')
  }
  return payload
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const config = getGoogleOAuthConfig()
  if (!config) throw new GoogleDriveBackupError('NOT_CONFIGURED')

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const payload = await res.json() as GoogleTokenResponse & { error?: string, error_description?: string }
  if (!res.ok || !payload.access_token) {
    throw new GoogleDriveBackupError('TOKEN_REFRESH_FAILED', payload.error_description ?? payload.error ?? 'Token refresh failed')
  }
  return payload
}

function encryptTokens(tokens: StoredGoogleTokens): Buffer {
  return encryptBuffer(Buffer.from(JSON.stringify(tokens), 'utf8'))
}

function decryptTokens(payload: Buffer): StoredGoogleTokens {
  const parsed = JSON.parse(decryptBuffer(payload).toString('utf8')) as StoredGoogleTokens
  if (!parsed.accessToken || !parsed.refreshToken) {
    throw new GoogleDriveBackupError('NOT_CONNECTED', 'Stored Google tokens are incomplete')
  }
  return parsed
}

export async function ensureBackupIntegration(db: Db) {
  const [existing] = await db.select().from(backupIntegrations)
    .where(eq(backupIntegrations.provider, 'google_drive'))
    .limit(1)
  if (existing) return existing

  const [created] = await db.insert(backupIntegrations).values({ provider: 'google_drive' }).returning()
  return created!
}

export async function getBackupIntegrationView(db: Db): Promise<BackupIntegrationView> {
  await ensureMasterKeyHydrated(db)
  await refreshAppConfigCache(db)
  const row = await ensureBackupIntegration(db)
  const config = getGoogleOAuthConfig()
  return {
    provider: 'google_drive',
    connected: row.connected,
    configured: !!config,
    envLocked: isGoogleOAuthEnvLocked(),
    hasClientSecret: !!config?.clientSecret,
    clientIdMasked: config ? maskClientId(config.clientId) : null,
    redirectUri: getGoogleOAuthRedirectUri(),
    accountEmail: row.accountEmail,
    folderId: row.folderId,
    lastTestedAt: row.lastTestedAt,
    lastError: row.lastError,
  }
}

async function fetchGoogleAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const payload = await res.json() as { user?: { emailAddress?: string }, error?: { message?: string } }
  if (!res.ok) {
    throw new GoogleDriveBackupError('TEST_FAILED', payload.error?.message ?? 'Drive about request failed')
  }
  return payload.user?.emailAddress ?? 'connected@google'
}

export async function connectGoogleDrive(
  db: Db,
  code: string,
  actorId: string,
  event: H3Event | null = null,
): Promise<BackupIntegrationView> {
  const tokenRes = await exchangeGoogleCode(code)
  if (!tokenRes.refresh_token) {
    throw new GoogleDriveBackupError('OAUTH_FAILED', 'Google did not return a refresh token — revoke app access and retry')
  }

  const email = await fetchGoogleAccountEmail(tokenRes.access_token)
  const integration = await ensureBackupIntegration(db)
  const encryptedTokens = encryptTokens({
    accessToken: tokenRes.access_token,
    refreshToken: tokenRes.refresh_token,
  })
  const expiresAt = new Date(Date.now() + tokenRes.expires_in * 1000)

  await db.update(backupIntegrations)
    .set({
      connected: true,
      accountEmail: email,
      encryptedTokens,
      tokenExpiresAt: expiresAt,
      lastError: null,
      lastTestedAt: new Date(),
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(backupIntegrations.id, integration.id))

  await writeAudit(event, {
    entityType: 'backup',
    entityId: integration.id,
    action: 'backup.google_drive.connected',
    afterData: { accountEmail: email },
    permissionKey: 'backups.manage.all',
    riskLevel: 'sensitive',
  })

  return getBackupIntegrationView(db)
}

export async function disconnectGoogleDrive(
  db: Db,
  actorId: string,
  event: H3Event | null = null,
): Promise<BackupIntegrationView> {
  const integration = await ensureBackupIntegration(db)
  await db.update(backupIntegrations)
    .set({
      connected: false,
      accountEmail: null,
      encryptedTokens: null,
      tokenExpiresAt: null,
      lastError: null,
      updatedBy: actorId,
      updatedAt: new Date(),
    })
    .where(eq(backupIntegrations.id, integration.id))

  await writeAudit(event, {
    entityType: 'backup',
    entityId: integration.id,
    action: 'backup.google_drive.disconnected',
    permissionKey: 'backups.manage.all',
    riskLevel: 'sensitive',
  })

  return getBackupIntegrationView(db)
}

async function getConnectedIntegrationRow(db: Db) {
  const [row] = await db.select().from(backupIntegrations)
    .where(and(
      eq(backupIntegrations.provider, 'google_drive'),
      eq(backupIntegrations.connected, true),
    ))
    .limit(1)
  if (!row?.encryptedTokens) throw new GoogleDriveBackupError('NOT_CONNECTED')
  return row
}

export async function getValidGoogleAccessToken(db: Db): Promise<string> {
  const row = await getConnectedIntegrationRow(db)
  await ensureMasterKeyHydrated(db)
  await refreshAppConfigCache(db)
  const tokens = decryptTokens(row.encryptedTokens!)
  const expiresAt = row.tokenExpiresAt?.getTime() ?? 0
  if (expiresAt > Date.now() + 60_000) return tokens.accessToken

  const refreshed = await refreshGoogleAccessToken(tokens.refreshToken)
  const nextTokens: StoredGoogleTokens = {
    accessToken: refreshed.access_token,
    refreshToken: tokens.refreshToken,
  }
  await db.update(backupIntegrations)
    .set({
      encryptedTokens: encryptTokens(nextTokens),
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      updatedAt: new Date(),
    })
    .where(eq(backupIntegrations.id, row.id))

  return refreshed.access_token
}

export async function testGoogleDriveConnection(db: Db): Promise<{ ok: boolean, accountEmail: string, message: string }> {
  await ensureMasterKeyHydrated(db)
  await refreshAppConfigCache(db)
  if (!getGoogleOAuthConfig()) {
    throw new GoogleDriveBackupError(
      'NOT_CONFIGURED',
      'Save Google Client ID and Client Secret in Backup settings before testing',
    )
  }

  const accessToken = await getValidGoogleAccessToken(db)
  const email = await fetchGoogleAccountEmail(accessToken)
  const integration = await ensureBackupIntegration(db)

  await db.update(backupIntegrations)
    .set({
      lastTestedAt: new Date(),
      lastError: null,
      accountEmail: email,
      updatedAt: new Date(),
    })
    .where(eq(backupIntegrations.id, integration.id))

  return {
    ok: true,
    accountEmail: email,
    message: `Connected to Google Drive as ${email}`,
  }
}

export async function uploadEncryptedBackupToDrive(
  db: Db,
  filename: string,
  encryptedPayload: Buffer,
): Promise<{ fileId: string }> {
  const accessToken = await getValidGoogleAccessToken(db)
  const integration = await getConnectedIntegrationRow(db)

  const metadata: Record<string, unknown> = {
    name: filename,
    mimeType: 'application/octet-stream',
    description: 'DORINC encrypted database backup (AES-256-GCM + zstd)',
  }
  if (integration.folderId) metadata.parents = [integration.folderId]

  const boundary = `dorinc_backup_${randomBytes(8).toString('hex')}`
  const metaPart = JSON.stringify(metadata)
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`
      + `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    encryptedPayload,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  const payload = await res.json() as { id?: string, error?: { message?: string } }
  if (!res.ok || !payload.id) {
    const message = payload.error?.message ?? 'Google Drive upload failed'
    await db.update(backupIntegrations)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(backupIntegrations.id, integration.id))
    throw new GoogleDriveBackupError('UPLOAD_FAILED', message)
  }

  await db.update(backupIntegrations)
    .set({ lastError: null, updatedAt: new Date() })
    .where(eq(backupIntegrations.id, integration.id))

  return { fileId: payload.id }
}
