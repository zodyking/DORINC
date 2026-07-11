// Integration tests for advanced template designer (P3-05).
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { mergeTemplateSections } from '../../shared/invoice-template-design'
import { seedInvoiceTemplates } from '../../server/db/seed-invoice-templates'
import { invoiceTemplates } from '../../server/db/schema/invoice-templates'
import {
  duplicateInvoiceTemplate,
  patchInvoiceTemplate,
  publishInvoiceTemplateVersion,
  setDefaultInvoiceTemplate,
  testRenderTemplatePdf,
} from '../../server/services/invoice-templates.service'
import { users } from '../../server/db/schema/auth'
import {
  approveInvoice,
  createInvoice,
} from '../../server/services/invoices.service'
import { createCustomer } from '../../server/services/customers.service'
import { createVehicle } from '../../server/services/vehicles.service'
import { customers } from '../../server/db/schema/customers'
import { invoices } from '../../server/db/schema/invoices'
import { vehicles } from '../../server/db/schema/vehicles'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

afterAll(async () => {
  await pool.end()
})

describe('P3-05 advanced template designer', () => {
  it('duplicates a template as draft v1', async () => {
    const { template } = await seedInvoiceTemplates(db)
    const [actor] = await db.select({ id: users.id }).from(users).limit(1)

    const detail = await duplicateInvoiceTemplate(db, template.id, actor!.id, 'Fleet Copy Test')
    expect(detail?.template.name).toBe('Fleet Copy Test')
    expect(detail?.template.isDefault).toBe(false)
    expect(detail?.latestVersion?.versionNumber).toBe(1)
    expect(detail?.latestVersion?.status).toBe('draft')

    await db.delete(invoiceTemplates).where(eq(invoiceTemplates.id, detail!.template.id))
  })

  it('publish stores section visibility in design settings', async () => {
    const { template } = await seedInvoiceTemplates(db)
    const [actor] = await db.select({ id: users.id }).from(users).limit(1)
    const published = await publishInvoiceTemplateVersion(db, template.id, {
      designSettings: {
        pageSize: 'Letter',
        marginInches: 0.5,
        accentColor: '#ffd400',
        accentColor2: '#0b0f1a',
        fontSans: 'ui-sans-serif, system-ui, sans-serif',
        fontMono: 'ui-monospace, monospace',
        logoFileId: null,
        sections: {
          vehicle: { visible: false, label: 'Vehicle' },
          footer: { visible: false, label: 'Footer' },
        },
      },
    }, actor!.id)

    const sections = mergeTemplateSections(published.designSettings.sections)
    expect(sections.vehicle.visible).toBe(false)
    expect(sections.footer.visible).toBe(false)
  })

  it('setDefault switches default template flag', async () => {
    const { template } = await seedInvoiceTemplates(db)
    const [actor] = await db.select({ id: users.id }).from(users).limit(1)
    const copy = await duplicateInvoiceTemplate(db, template.id, actor!.id, 'Temp Default Target')

    await setDefaultInvoiceTemplate(db, copy!.template.id)
    const [updated] = await db.select().from(invoiceTemplates).where(eq(invoiceTemplates.id, copy!.template.id))
    expect(updated?.isDefault).toBe(true)

    await setDefaultInvoiceTemplate(db, template.id)
    await db.delete(invoiceTemplates).where(eq(invoiceTemplates.id, copy!.template.id))
  })

  it('renames a template via patchInvoiceTemplate', async () => {
    const { template } = await seedInvoiceTemplates(db)
    const renamed = await patchInvoiceTemplate(db, template.id, { name: 'Renamed Fleet Template' })
    expect(renamed?.name).toBe('Renamed Fleet Template')
    await patchInvoiceTemplate(db, template.id, { name: template.name })
  })

  it('test PDF enqueue skips invoice_files when templateVersionId is null', async () => {
    const [actor] = await db.select({ id: users.id }).from(users).limit(1)
    const stamp = Date.now()
    const cust = await createCustomer(db, {
      displayName: `TplPreview-${stamp}`,
      accountKind: 'individual',
    }, actor!.id)
    const veh = await createVehicle(db, {
      customerId: cust.id,
      unitType: 'truck',
      busNumber: `TP-${stamp}`,
    }, actor!.id)
    const inv = await createInvoice(db, {
      customerId: cust.id,
      vehicleId: veh.id,
      invoiceDate: '2026-07-08',
    }, actor!.id)
    await approveInvoice(db, inv.id, actor!.id)

    const { template } = await seedInvoiceTemplates(db)
    const { job } = await testRenderTemplatePdf(db, template.id, {
      designSettings: {
        pageSize: 'Letter',
        marginInches: 0.5,
        accentColor: '#ffd400',
        accentColor2: '#0b0f1a',
        fontSans: 'ui-sans-serif, system-ui, sans-serif',
        fontMono: 'ui-monospace, monospace',
        logoFileId: null,
      },
    }, actor!.id)

    expect(job.entityType).toBe('invoice')
    expect(job.templateVersionId).toBeNull()
    expect(job.renderPayload.length).toBeGreaterThan(500)

    await db.delete(invoices).where(eq(invoices.customerId, cust.id))
    await db.delete(vehicles).where(eq(vehicles.customerId, cust.id))
    await db.delete(customers).where(eq(customers.id, cust.id))
  })
})
