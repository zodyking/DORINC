import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { billingIntegrations } from '../db/schema/billing-integrations'
import { decryptBuffer, encryptBuffer } from './encryption.service'
import { ensureEncryptionReadyForSettings } from './app-config.service'
import type { BillingIntegrationsPatch, BillingIntegrationsView } from '../../shared/validators/billing-integrations'

export class BillingIntegrationsServiceError extends Error {
  constructor(public readonly code: 'NOT_CONFIGURED' | 'KEY_MISSING', message?: string) {
    super(message ?? code)
  }
}

export type { BillingIntegrationsView } from '../../shared/validators/billing-integrations'

function toView(row: typeof billingIntegrations.$inferSelect): BillingIntegrationsView {
  return {
    id: row.id,
    vultrEnabled: row.vultrEnabled,
    hasVultrApiKey: row.encryptedVultrApiKey != null && row.encryptedVultrApiKey.length > 0,
    vultrMonitoredInstanceIds: row.vultrMonitoredInstanceIds ?? [],
    namecheapEnabled: row.namecheapEnabled,
    hasNamecheapApiKey: row.encryptedNamecheapApiKey != null && row.encryptedNamecheapApiKey.length > 0,
    namecheapApiUser: row.namecheapApiUser,
    namecheapUsername: row.namecheapUsername,
    namecheapClientIp: row.namecheapClientIp,
    namecheapUseSandbox: row.namecheapUseSandbox,
    namecheapMonitoredDomains: row.namecheapMonitoredDomains ?? [],
    openrouterBillingEnabled: row.openrouterBillingEnabled,
    hasOpenrouterManagementKey: row.encryptedOpenrouterManagementKey != null && row.encryptedOpenrouterManagementKey.length > 0,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function ensureBillingIntegrations(db: Db): Promise<BillingIntegrationsView> {
  const [existing] = await db.select().from(billingIntegrations).limit(1)
  if (existing) return toView(existing)
  const [created] = await db.insert(billingIntegrations).values({}).returning()
  return toView(created!)
}

export async function getBillingIntegrations(db: Db): Promise<BillingIntegrationsView> {
  return ensureBillingIntegrations(db)
}

export async function updateBillingIntegrations(
  db: Db,
  patch: BillingIntegrationsPatch,
  actorId: string,
): Promise<BillingIntegrationsView> {
  const current = await ensureBillingIntegrations(db)
  const {
    vultrApiKey,
    namecheapApiKey,
    openrouterManagementKey,
    ...rest
  } = patch

  const update: Partial<typeof billingIntegrations.$inferInsert> = {
    ...rest,
    updatedBy: actorId,
    updatedAt: new Date(),
  }

  if (vultrApiKey !== undefined) {
    await ensureEncryptionReadyForSettings(db)
    update.encryptedVultrApiKey = encryptBuffer(Buffer.from(vultrApiKey, 'utf8'))
  }
  if (namecheapApiKey !== undefined) {
    await ensureEncryptionReadyForSettings(db)
    update.encryptedNamecheapApiKey = encryptBuffer(Buffer.from(namecheapApiKey, 'utf8'))
  }
  if (openrouterManagementKey !== undefined) {
    await ensureEncryptionReadyForSettings(db)
    update.encryptedOpenrouterManagementKey = encryptBuffer(Buffer.from(openrouterManagementKey, 'utf8'))
  }

  const [updated] = await db.update(billingIntegrations)
    .set(update)
    .where(eq(billingIntegrations.id, current.id))
    .returning()

  return toView(updated!)
}

async function readSecret(buffer: Buffer | null | undefined): Promise<string | null> {
  if (!buffer?.length) return null
  try {
    return decryptBuffer(buffer).toString('utf8').trim() || null
  }
  catch {
    throw new BillingIntegrationsServiceError('KEY_MISSING', 'Stored credential could not be decrypted')
  }
}

export async function getVultrApiKey(db: Db): Promise<string | null> {
  const [row] = await db.select({ key: billingIntegrations.encryptedVultrApiKey })
    .from(billingIntegrations).limit(1)
  return readSecret(row?.key)
}

export async function getNamecheapCredentials(db: Db): Promise<{
  apiUser: string
  apiKey: string
  username: string
  clientIp: string
  useSandbox: boolean
} | null> {
  const [row] = await db.select().from(billingIntegrations).limit(1)
  if (!row?.namecheapApiUser || !row.namecheapUsername || !row.namecheapClientIp) return null
  const apiKey = await readSecret(row.encryptedNamecheapApiKey)
  if (!apiKey) return null
  return {
    apiUser: row.namecheapApiUser,
    apiKey,
    username: row.namecheapUsername,
    clientIp: row.namecheapClientIp,
    useSandbox: row.namecheapUseSandbox,
  }
}

export async function getOpenrouterManagementKey(db: Db): Promise<string | null> {
  const [row] = await db.select({ key: billingIntegrations.encryptedOpenrouterManagementKey })
    .from(billingIntegrations).limit(1)
  return readSecret(row?.key)
}
