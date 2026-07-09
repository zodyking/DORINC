// Seeds system account types, the permission registry, and default bundles.
// Idempotent — safe to re-run. Usage: npm run db:seed
import { config } from 'dotenv'
import { eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import {
  ACCOUNT_TYPE_BUNDLES,
  ACCOUNT_TYPES,
  PERMISSIONS,
} from '../../shared/permissions/keys'
import type { PermissionKey } from '../../shared/permissions/keys'
import { accountTypePermissions, accountTypes, permissions } from './schema/auth'
import { seedInvoiceTemplates } from './seed-invoice-templates'

config()

const ACCOUNT_TYPE_NAMES: Record<(typeof ACCOUNT_TYPES)[number], { name: string, description: string }> = {
  super_admin: { name: 'Super Admin', description: 'Full control; cannot be deleted or demoted by normal Admin' },
  admin: { name: 'Admin', description: 'Day-to-day admin; no audit tampering or Super Admin demotion' },
  manager: { name: 'Manager', description: 'Operational oversight' },
  accountant: { name: 'Accountant', description: 'Billing workflow — logs, invoices, PDFs, AI suggestions' },
  mechanic: { name: 'Mechanic', description: 'Mobile upload; no invoice create/approve/send/void' },
  viewer: { name: 'Viewer', description: 'Read-only internal' },
  external_auditor: { name: 'External Auditor', description: 'Restricted read-only for CPA/bookkeeper/legal' },
  customer: { name: 'Customer', description: 'Portal only; staff-created accounts; no self-signup' },
}

export async function seedAuth(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set')
  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle({ client: pool })

  try {
    // 1. Account types
    for (const key of ACCOUNT_TYPES) {
      const { name, description } = ACCOUNT_TYPE_NAMES[key]
      await db.insert(accountTypes)
        .values({ key, name, description, isSystem: true })
        .onConflictDoUpdate({
          target: accountTypes.key,
          set: { name, description, updatedAt: sql`now()` },
        })
    }

    // 2. Permissions registry
    for (const [key, description] of Object.entries(PERMISSIONS)) {
      const module = key.split('.')[0]!
      await db.insert(permissions)
        .values({ key, description, module })
        .onConflictDoUpdate({ target: permissions.key, set: { description, module } })
    }

    // 3. Default bundles (sync: remove stale, add missing)
    const typeRows = await db.select().from(accountTypes)
    const permRows = await db.select().from(permissions)
    const permIdByKey = new Map(permRows.map(p => [p.key, p.id]))

    for (const typeRow of typeRows) {
      const bundle = ACCOUNT_TYPE_BUNDLES[typeRow.key as keyof typeof ACCOUNT_TYPE_BUNDLES] ?? []
      const wantedIds = new Set(bundle.map((k: PermissionKey) => permIdByKey.get(k)).filter(Boolean) as string[])

      const existing = await db.select().from(accountTypePermissions)
        .where(eq(accountTypePermissions.accountTypeId, typeRow.id))
      const existingIds = new Set(existing.map(r => r.permissionId))

      for (const id of wantedIds) {
        if (!existingIds.has(id)) {
          await db.insert(accountTypePermissions)
            .values({ accountTypeId: typeRow.id, permissionId: id })
            .onConflictDoNothing()
        }
      }
      for (const row of existing) {
        if (!wantedIds.has(row.permissionId)) {
          await db.delete(accountTypePermissions).where(eq(accountTypePermissions.id, row.id))
        }
      }
    }

    const counts = {
      accountTypes: typeRows.length,
      permissions: permRows.length,
    }
    console.log(`[seed] account_types=${counts.accountTypes} permissions=${counts.permissions} bundles synced`)

    const templateSeed = await seedInvoiceTemplates(db)
    console.log(`[seed] invoice_template=${templateSeed.template.slug} version=${templateSeed.publishedVersion.versionNumber} status=${templateSeed.publishedVersion.status}`)

    return { ...counts, invoiceTemplate: templateSeed.template.slug }
  }
  finally {
    await pool.end()
  }
}

// Run directly (tsx server/db/seed.ts)
if (process.argv[1]?.replace(/\\/g, '/').endsWith('server/db/seed.ts')) {
  seedAuth().catch((err) => {
    console.error(err)  
    process.exit(1)
  })
}
