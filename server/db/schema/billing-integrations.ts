import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { bytea } from './ai'
import { users } from './auth'
import type { NamecheapManualDomain } from '../../../shared/validators/billing-integrations'

/** Singleton credentials + watch lists for external billing providers. */
export const billingIntegrations = pgTable('billing_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  vultrEnabled: boolean('vultr_enabled').notNull().default(false),
  encryptedVultrApiKey: bytea('encrypted_vultr_api_key'),
  vultrMonitoredInstanceIds: jsonb('vultr_monitored_instance_ids').$type<string[]>().notNull().default([]),
  namecheapEnabled: boolean('namecheap_enabled').notNull().default(false),
  namecheapApiUser: text('namecheap_api_user'),
  namecheapUsername: text('namecheap_username'),
  namecheapClientIp: text('namecheap_client_ip'),
  encryptedNamecheapApiKey: bytea('encrypted_namecheap_api_key'),
  namecheapUseSandbox: boolean('namecheap_use_sandbox').notNull().default(false),
  namecheapMonitoredDomains: jsonb('namecheap_monitored_domains').$type<string[]>().notNull().default([]),
  namecheapManualDomains: jsonb('namecheap_manual_domains').$type<NamecheapManualDomain[]>().notNull().default([]),
  openrouterBillingEnabled: boolean('openrouter_billing_enabled').notNull().default(true),
  encryptedOpenrouterManagementKey: bytea('encrypted_openrouter_management_key'),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
