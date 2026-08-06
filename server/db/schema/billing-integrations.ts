import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { bytea } from './ai'
import { users } from './auth'
import type { DomainRenewal } from '../../../shared/validators/billing-integrations'

/** Singleton credentials + watch lists for external billing providers. */
export const billingIntegrations = pgTable('billing_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  vultrEnabled: boolean('vultr_enabled').notNull().default(false),
  encryptedVultrApiKey: bytea('encrypted_vultr_api_key'),
  vultrMonitoredInstanceIds: jsonb('vultr_monitored_instance_ids').$type<string[]>().notNull().default([]),
  encryptedVultrUsername: bytea('encrypted_vultr_username'),
  encryptedVultrPassword: bytea('encrypted_vultr_password'),
  /** @deprecated Manual domain list retained for migration; Cloudflare registrar is the live source. */
  domainRenewals: jsonb('domain_renewals').$type<DomainRenewal[]>().notNull().default([]),
  cloudflareEnabled: boolean('cloudflare_enabled').notNull().default(false),
  cloudflareAccountId: text('cloudflare_account_id'),
  encryptedCloudflareApiToken: bytea('encrypted_cloudflare_api_token'),
  encryptedCloudflareUsername: bytea('encrypted_cloudflare_username'),
  encryptedCloudflarePassword: bytea('encrypted_cloudflare_password'),
  openrouterBillingEnabled: boolean('openrouter_billing_enabled').notNull().default(true),
  encryptedOpenrouterManagementKey: bytea('encrypted_openrouter_management_key'),
  encryptedOpenrouterUsername: bytea('encrypted_openrouter_username'),
  encryptedOpenrouterPassword: bytea('encrypted_openrouter_password'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
