// Integration tests for default invoice template seed (P1-27).
import { config } from 'dotenv'
import { and, eq, desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  BLADE_INVOICE_TEMPLATE_MARKER,
  mergeTemplateSections,
} from '../../shared/invoice-template-design'
import {
  DEFAULT_INVOICE_TEMPLATE_NAME,
  DEFAULT_INVOICE_TEMPLATE_SLUG,
  seedInvoiceTemplates,
} from '../../server/db/seed-invoice-templates'
import {
  invoiceTemplateVersions,
  invoiceTemplates,
} from '../../server/db/schema/invoice-templates'
import { publishInvoiceTemplateVersion, getLatestTemplateVersion } from '../../server/services/invoice-templates.service'
import { users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

afterAll(async () => {
  await pool.end()
})

describe('P1-27 invoice template seed', () => {
  it('seeds standard Blade template as published v1', async () => {
    const { template, publishedVersion, baselineVersion } = await seedInvoiceTemplates(db)

    expect(template.name).toBe(DEFAULT_INVOICE_TEMPLATE_NAME)
    expect(template.slug).toBe(DEFAULT_INVOICE_TEMPLATE_SLUG)
    expect(template.isDefault).toBe(true)

    expect(publishedVersion.versionNumber).toBeGreaterThanOrEqual(1)
    expect(publishedVersion.status).toBe('published')
    expect(publishedVersion.layoutMarker).toBe(BLADE_INVOICE_TEMPLATE_MARKER)
    expect(baselineVersion.designSettings.pageSize).toBe('Letter')

    const [storedTemplate] = await db.select().from(invoiceTemplates)
      .where(eq(invoiceTemplates.slug, DEFAULT_INVOICE_TEMPLATE_SLUG))
    expect(storedTemplate?.isDefault).toBe(true)

    const [storedPublished] = await db.select().from(invoiceTemplateVersions)
      .where(and(
        eq(invoiceTemplateVersions.templateId, storedTemplate!.id),
        eq(invoiceTemplateVersions.status, 'published'),
      ))
      .orderBy(desc(invoiceTemplateVersions.versionNumber))
      .limit(1)
    expect(storedPublished?.status).toBe('published')
  })

  it('publish creates a new template version with updated design settings (P1-30)', async () => {
    const { template } = await seedInvoiceTemplates(db)
    const [actor] = await db.select({ id: users.id }).from(users).limit(1)
    const beforeLatest = await getLatestTemplateVersion(db, template.id)

    const version = await publishInvoiceTemplateVersion(db, template.id, {
      designSettings: {
        pageSize: 'A4',
        marginInches: 0.75,
        accentColor: '#4f46e5',
        accentColor2: '#0b0f1a',
        fontSans: 'Inter, ui-sans-serif, system-ui, sans-serif',
        fontMono: 'ui-monospace, monospace',
        logoFileId: null,
      },
    }, actor!.id)

    expect(version.versionNumber).toBe(beforeLatest!.versionNumber + 1)
    expect(version.status).toBe('published')
    expect(version.designSettings.pageSize).toBe('A4')
    expect(version.designSettings.accentColor).toBe('#4f46e5')
    expect(version.layoutMarker).toBe(BLADE_INVOICE_TEMPLATE_MARKER)
    expect(mergeTemplateSections(version.designSettings.sections).vehicle.visible).toBe(true)

    const [priorPublished] = await db.select().from(invoiceTemplateVersions)
      .where(and(
        eq(invoiceTemplateVersions.templateId, template.id),
        eq(invoiceTemplateVersions.versionNumber, beforeLatest!.versionNumber),
      ))
    expect(priorPublished?.status).toBe('archived')
  })
})
