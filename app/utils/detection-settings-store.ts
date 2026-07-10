import type { CatalogKeywordMap, LineTypeVerbSettings } from '#shared/workspace-settings-defaults'

let cache: {
  catalogKeywords: CatalogKeywordMap
  lineTypeVerbs: LineTypeVerbSettings
} | null = null

export function setDetectionSettingsCache(data: {
  catalogKeywords: CatalogKeywordMap
  lineTypeVerbs: LineTypeVerbSettings
}) {
  cache = data
}

export function getLineTypeVerbsCache(): LineTypeVerbSettings | null {
  return cache?.lineTypeVerbs ?? null
}

export function getCatalogKeywordsCache(): CatalogKeywordMap | null {
  return cache?.catalogKeywords ?? null
}
