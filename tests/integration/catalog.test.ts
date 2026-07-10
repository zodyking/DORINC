// Integration tests for catalog schema/API (P1-18): items, categories,
// labor rates, search, archive, taxable flag.
import { config } from 'dotenv'
import { like } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import {
  archiveCatalogItem,
  createCatalogItem,
  createCategory,
  createLaborRate,
  listCatalogItems,
} from '../../server/services/catalog.service'
import { catalogCategories, catalogItems, catalogLaborRates } from '../../server/db/schema/catalog'
import { users } from '../../server/db/schema/auth'

config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle({ client: pool })

const stamp = Date.now()
const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)
const ACTOR = anyUser!.id

const category = await createCategory(db, { name: `CatTest-${stamp}`, sortOrder: 1 })

afterAll(async () => {
  await db.delete(catalogLaborRates).where(like(catalogLaborRates.name, `CatTest-${stamp}%`))
  await db.delete(catalogItems).where(like(catalogItems.name, `CatTest-${stamp}%`))
  await db.delete(catalogCategories).where(like(catalogCategories.name, `CatTest-${stamp}%`))
  await pool.end()
})

describe('P1-18 catalog items', () => {
  it('creates parts/labor/fees with taxable flag and category', async () => {
    const part = await createCatalogItem(db, {
      itemType: 'part',
      sku: `PART-${stamp}`,
      name: `CatTest-${stamp} NOx sensor`,
      categoryId: category.id,
      defaultPrice: '412.68',
      taxable: true,
      uom: 'each',
    }, ACTOR)
    expect(part.taxable).toBe(true)
    expect(part.itemType).toBe('part')

    const fee = await createCatalogItem(db, {
      itemType: 'fee',
      sku: `FEE-${stamp}`,
      name: `CatTest-${stamp} Shop supplies`,
      defaultPrice: '3.5',
      taxable: false,
      uom: 'pct',
    }, ACTOR)
    expect(fee.taxable).toBe(false)
  })

  it('searches by name/sku and archives items', async () => {
    const item = await createCatalogItem(db, {
      itemType: 'labor',
      sku: `SRV-${stamp}`,
      name: `CatTest-${stamp} Brake inspection`,
      defaultPrice: '72.50',
    }, ACTOR)

    const found = await listCatalogItems(db, { q: 'Brake inspection', page: 1, pageSize: 10 })
    expect(found.items.some(i => i.id === item.id)).toBe(true)

    await archiveCatalogItem(db, item.id)
    const hidden = await listCatalogItems(db, { q: 'Brake inspection', page: 1, pageSize: 10 })
    expect(hidden.items.some(i => i.id === item.id)).toBe(false)

    const archived = await listCatalogItems(db, { q: 'Brake inspection', includeArchived: true, page: 1, pageSize: 10 })
    expect(archived.items.some(i => i.id === item.id)).toBe(true)
  })

  it('filters by item type and taxable flag', async () => {
    await createCatalogItem(db, {
      itemType: 'labor',
      sku: `LAB-${stamp}`,
      name: `CatTest-${stamp} Diesel tech`,
      defaultPrice: '145.00',
      uom: 'hr',
      taxable: true,
    }, ACTOR)

    const laborItems = await listCatalogItems(db, { itemType: 'labor', page: 1, pageSize: 50 })
    expect(laborItems.items.every(i => i.itemType === 'labor')).toBe(true)

    const nontax = await listCatalogItems(db, { taxable: false, page: 1, pageSize: 50 })
    expect(nontax.items.every(i => i.taxable === false)).toBe(true)
  })
})

describe('P1-18 labor rates', () => {
  it('creates a labor rate row', async () => {
    const rate = await createLaborRate(db, {
      name: `CatTest-${stamp} Onsite call`,
      sku: `LABR-${stamp}`,
      rate: '95.00',
      uom: 'flat',
      categoryId: category.id,
    }, ACTOR)
    expect(rate.rate).toBe('95.00')
    expect(rate.uom).toBe('flat')
  })
})
