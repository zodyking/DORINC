import { sql } from 'drizzle-orm'
import type { Db } from './client'
import { catalogCategories } from './schema/catalog'
import { DEFAULT_CATALOG_CATEGORIES } from '../../shared/catalog-default-categories'

/** Idempotent — inserts default categories that are not already present (case-insensitive). */
export async function seedCatalogCategories(db: Db) {
  let inserted = 0
  for (let i = 0; i < DEFAULT_CATALOG_CATEGORIES.length; i++) {
    const name = DEFAULT_CATALOG_CATEGORIES[i]!
    const [existing] = await db
      .select({ id: catalogCategories.id })
      .from(catalogCategories)
      .where(sql`lower(${catalogCategories.name}) = ${name.toLowerCase()}`)
      .limit(1)

    if (existing) continue

    await db.insert(catalogCategories).values({
      name,
      sortOrder: i + 1,
    })
    inserted++
  }
  return { inserted, total: DEFAULT_CATALOG_CATEGORIES.length }
}
