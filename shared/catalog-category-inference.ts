import { DEFAULT_CATALOG_CATEGORIES, type DefaultCatalogCategory } from './catalog-default-categories'
import { DEFAULT_CATEGORY_KEYWORDS } from './catalog-category-keywords'
import type { CatalogKeywordMap } from './workspace-settings-defaults'

export interface CatalogCategoryOption {
  id: string
  name: string
}

export interface CategoryInferenceResult {
  categoryId: string
  categoryName: string
  confidence: number
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keywordsForCategory(
  name: string,
  keywordMap: CatalogKeywordMap,
): string[] {
  const exact = DEFAULT_CATALOG_CATEGORIES.find(
    c => c.toLowerCase() === name.trim().toLowerCase(),
  )
  if (exact && keywordMap[exact]?.length) return [...keywordMap[exact]!, exact]

  const custom = keywordMap[name]
  if (custom?.length) return [...custom, name]

  const fromName = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3)
  return [name, ...fromName]
}

function scoreCategory(text: string, categoryName: string, keywords: string[]): number {
  const norm = normalizeForMatch(text)
  if (!norm) return 0

  let score = 0
  for (const kw of keywords) {
    const nkw = normalizeForMatch(kw)
    if (!nkw || !norm.includes(nkw)) continue
    if (nkw.includes(' ')) score += 4
    else if (nkw.length >= 8) score += 3
    else if (nkw.length >= 5) score += 2
    else score += 1
  }

  const nameNorm = normalizeForMatch(categoryName)
  if (nameNorm && norm.includes(nameNorm)) score += 5
  for (const word of nameNorm.split(' ')) {
    if (word.length >= 4 && norm.includes(word)) score += 1
  }

  return score
}

/** Minimum score to auto-select a category (tuned for short part names). */
const MIN_SCORE = 2

export function buildCatalogKeywordMap(overrides?: CatalogKeywordMap | null): CatalogKeywordMap {
  const map: CatalogKeywordMap = {}
  for (const name of DEFAULT_CATALOG_CATEGORIES) {
    const base = DEFAULT_CATEGORY_KEYWORDS[name as DefaultCatalogCategory] ?? []
    const custom = overrides?.[name]
    map[name] = custom?.length ? [...custom] : [...base]
  }
  if (overrides) {
    for (const [name, words] of Object.entries(overrides)) {
      if (!map[name] && words.length) map[name] = [...words]
    }
  }
  return map
}

/**
 * Recommend a catalog category from free-text (name + optional description).
 * Returns null when confidence is too low.
 */
export function inferCatalogCategory(
  text: string,
  categories: CatalogCategoryOption[],
  keywordMap?: CatalogKeywordMap | null,
): CategoryInferenceResult | null {
  const input = text.trim()
  if (!input || !categories.length) return null

  const keywords = buildCatalogKeywordMap(keywordMap)
  let best: { category: CatalogCategoryOption, score: number } | null = null

  for (const category of categories) {
    const categoryKeywords = keywordsForCategory(category.name, keywords)
    const score = scoreCategory(input, category.name, categoryKeywords)
    if (!best || score > best.score) best = { category, score }
  }

  if (!best || best.score < MIN_SCORE) return null

  const maxPossible = 12
  const confidence = Math.min(1, best.score / maxPossible)

  return {
    categoryId: best.category.id,
    categoryName: best.category.name,
    confidence,
  }
}
