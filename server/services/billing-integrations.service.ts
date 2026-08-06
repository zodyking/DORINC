import { eq } from 'drizzle-orm'
import type { Db } from '../db/client'
import { billingIntegrations } from '../db/schema/billing-integrations'
import { decryptBuffer, encryptBuffer } from './encryption.service'
import { ensureEncryptionReadyForSettings, ensureMasterKeyHydrated } from './app-config.service'
import type {
  BillingIntegrationsPatch,
  BillingIntegrationsView,
  BillingProviderKey,
} from '../../shared/validators/billing-integrations'
import { getAiProviderSettings } from './ai-provider.service'
import { normalizeDomainRenewals } from './domain-renewals.service'

export class BillingIntegrationsServiceError extends Error {
  constructor(public readonly code: 'NOT_CONFIGURED' | 'KEY_MISSING', message?: string) {
    super(message ?? code)
  }
}

export type { BillingIntegrationsView } from '../../shared/validators/billing-integrations'

function hasSecret(buffer: Buffer | null | undefined): boolean {
  return buffer != null && buffer.length > 0
}

function toView(row: typeof billingIntegrations.$inferSelect): BillingIntegrationsView {
  return {
    id: row.id,
    vultrEnabled: row.vultrEnabled,
    hasVultrApiKey: hasSecret(row.encryptedVultrApiKey),
    vultrMonitoredInstanceIds: row.vultrMonitoredInstanceIds ?? [],
    hasVultrUsername: hasSecret(row.encryptedVultrUsername),
    hasVultrPassword: hasSecret(row.encryptedVultrPassword),
    domainRenewals: row.domainRenewals ?? [],
    cloudflareEnabled: row.cloudflareEnabled,
    cloudflareAccountId: row.cloudflareAccountId ?? null,
    hasCloudflareApiToken: hasSecret(row.encryptedCloudflareApiToken),
    hasCloudflareUsername: hasSecret(row.encryptedCloudflareUsername),
    hasCloudflarePassword: hasSecret(row.encryptedCloudflarePassword),
    openrouterBillingEnabled: row.openrouterBillingEnabled,
    hasOpenrouterManagementKey: hasSecret(row.encryptedOpenrouterManagementKey),
    hasAiOpenRouterKey: false,
    hasOpenrouterUsername: hasSecret(row.encryptedOpenrouterUsername),
    hasOpenrouterPassword: hasSecret(row.encryptedOpenrouterPassword),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function composeBillingIntegrationsView(
  db: Db,
  row: typeof billingIntegrations.$inferSelect,
): Promise<BillingIntegrationsView> {
  const ai = await getAiProviderSettings(db)
  return {
    ...toView(row),
    hasAiOpenRouterKey: ai.hasApiKey,
  }
}

export async function ensureBillingIntegrations(db: Db): Promise<BillingIntegrationsView> {
  const [existing] = await db.select().from(billingIntegrations).limit(1)
  if (existing) return composeBillingIntegrationsView(db, existing)
  const [created] = await db.insert(billingIntegrations).values({}).returning()
  return composeBillingIntegrationsView(db, created!)
}

export async function getBillingIntegrations(db: Db): Promise<BillingIntegrationsView> {
  return ensureBillingIntegrations(db)
}

function encryptOptionalSecret(value: string | undefined): Buffer | undefined {
  if (value === undefined) return undefined
  return encryptBuffer(Buffer.from(value, 'utf8'))
}

export async function updateBillingIntegrations(
  db: Db,
  patch: BillingIntegrationsPatch,
  actorId: string,
): Promise<BillingIntegrationsView> {
  const [existing] = await db.select().from(billingIntegrations).limit(1)
  const row = existing ?? (await db.insert(billingIntegrations).values({}).returning())[0]
  if (!row) {
    throw new Error('Billing settings could not be initialized')
  }

  const {
    vultrApiKey,
    openrouterManagementKey,
    domainRenewals,
    vultrEnabled,
    vultrMonitoredInstanceIds,
    openrouterBillingEnabled,
    cloudflareEnabled,
    cloudflareAccountId,
    cloudflareApiToken,
    vultrUsername,
    vultrPassword,
    cloudflareUsername,
    cloudflarePassword,
    openrouterUsername,
    openrouterPassword,
  } = patch

  const update: Partial<typeof billingIntegrations.$inferInsert> = {
    updatedBy: actorId,
    updatedAt: new Date(),
  }

  if (vultrEnabled !== undefined) update.vultrEnabled = vultrEnabled
  if (vultrMonitoredInstanceIds !== undefined) update.vultrMonitoredInstanceIds = vultrMonitoredInstanceIds
  if (openrouterBillingEnabled !== undefined) update.openrouterBillingEnabled = openrouterBillingEnabled
  if (cloudflareEnabled !== undefined) update.cloudflareEnabled = cloudflareEnabled
  if (cloudflareAccountId !== undefined) update.cloudflareAccountId = cloudflareAccountId.trim()
  if (domainRenewals !== undefined) update.domainRenewals = normalizeDomainRenewals(domainRenewals)

  const needsEncryption = [
    vultrApiKey,
    openrouterManagementKey,
    cloudflareApiToken,
    vultrUsername,
    vultrPassword,
    cloudflareUsername,
    cloudflarePassword,
    openrouterUsername,
    openrouterPassword,
  ].some(value => value !== undefined)

  if (needsEncryption) {
    await ensureEncryptionReadyForSettings(db)
  }

  if (vultrApiKey !== undefined) update.encryptedVultrApiKey = encryptOptionalSecret(vultrApiKey)
  if (openrouterManagementKey !== undefined) {
    update.encryptedOpenrouterManagementKey = encryptOptionalSecret(openrouterManagementKey)
  }
  if (cloudflareApiToken !== undefined) {
    update.encryptedCloudflareApiToken = encryptOptionalSecret(cloudflareApiToken)
  }
  if (vultrUsername !== undefined) update.encryptedVultrUsername = encryptOptionalSecret(vultrUsername)
  if (vultrPassword !== undefined) update.encryptedVultrPassword = encryptOptionalSecret(vultrPassword)
  if (cloudflareUsername !== undefined) {
    update.encryptedCloudflareUsername = encryptOptionalSecret(cloudflareUsername)
  }
  if (cloudflarePassword !== undefined) {
    update.encryptedCloudflarePassword = encryptOptionalSecret(cloudflarePassword)
  }
  if (openrouterUsername !== undefined) {
    update.encryptedOpenrouterUsername = encryptOptionalSecret(openrouterUsername)
  }
  if (openrouterPassword !== undefined) {
    update.encryptedOpenrouterPassword = encryptOptionalSecret(openrouterPassword)
  }

  const [updated] = await db.update(billingIntegrations)
    .set(update)
    .where(eq(billingIntegrations.id, row.id))
    .returning()

  if (!updated) {
    throw new Error('Billing settings row was not updated')
  }

  return composeBillingIntegrationsView(db, updated)
}

async function readSecret(
  db: Db,
  buffer: Buffer | null | undefined,
): Promise<string | null> {
  if (!buffer?.length) return null
  try {
    await ensureMasterKeyHydrated(db)
    return decryptBuffer(buffer).toString('utf8').trim() || null
  }
  catch (err) {
    if ((err as Error).message?.includes('ENCRYPTION_MASTER_KEY')) {
      throw new BillingIntegrationsServiceError(
        'KEY_MISSING',
        'Encryption is not configured — open Control Panel → Security or set ENCRYPTION_MASTER_KEY',
      )
    }
    throw new BillingIntegrationsServiceError('KEY_MISSING', 'Stored credential could not be decrypted')
  }
}

export async function getVultrApiKey(db: Db): Promise<string | null> {
  const [row] = await db.select({ key: billingIntegrations.encryptedVultrApiKey })
    .from(billingIntegrations).limit(1)
  return readSecret(db, row?.key)
}

export async function getOpenRouterManagementKey(db: Db): Promise<string | null> {
  const [row] = await db.select({ key: billingIntegrations.encryptedOpenrouterManagementKey })
    .from(billingIntegrations).limit(1)
  return readSecret(db, row?.key)
}

export async function getCloudflareApiToken(db: Db): Promise<string | null> {
  const [row] = await db.select({ key: billingIntegrations.encryptedCloudflareApiToken })
    .from(billingIntegrations).limit(1)
  return readSecret(db, row?.key)
}

export async function getCloudflareAccountId(db: Db): Promise<string | null> {
  const [row] = await db.select({ accountId: billingIntegrations.cloudflareAccountId })
    .from(billingIntegrations).limit(1)
  const value = row?.accountId?.trim()
  return value || null
}

export async function revealBillingPortalCredentials(
  db: Db,
  provider: BillingProviderKey,
): Promise<{ username: string | null, password: string | null }> {
  const [row] = await db.select().from(billingIntegrations).limit(1)
  if (!row) return { username: null, password: null }

  if (provider === 'vultr') {
    return {
      username: await readSecret(db, row.encryptedVultrUsername),
      password: await readSecret(db, row.encryptedVultrPassword),
    }
  }
  if (provider === 'cloudflare') {
    return {
      username: await readSecret(db, row.encryptedCloudflareUsername),
      password: await readSecret(db, row.encryptedCloudflarePassword),
    }
  }
  return {
    username: await readSecret(db, row.encryptedOpenrouterUsername),
    password: await readSecret(db, row.encryptedOpenrouterPassword),
  }
}
