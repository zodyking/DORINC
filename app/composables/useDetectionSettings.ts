import type { CatalogKeywordMap, LineTypeVerbSettings } from '#shared/workspace-settings-defaults'
import { clearDetectionSettingsCache, setDetectionSettingsCache } from '~/utils/detection-settings-store'

const detection = ref<{
  catalogKeywords: CatalogKeywordMap
  lineTypeVerbs: LineTypeVerbSettings
} | null>(null)

let loadPromise: Promise<void> | null = null

async function fetchDetectionSettings(force = false) {
  if (!force && detection.value) return detection.value
  if (!loadPromise) {
    loadPromise = $fetch<{
      catalogKeywords: CatalogKeywordMap
      lineTypeVerbs: LineTypeVerbSettings
    }>('/api/settings/detection')
      .then((data) => {
        detection.value = data
        setDetectionSettingsCache(data)
        return data
      })
      .catch(() => {
        detection.value = null
        clearDetectionSettingsCache()
        return null
      })
      .finally(() => {
        loadPromise = null
      })
  }
  await loadPromise
  return detection.value
}

/** Refetch after admin saves new verb/keyword lists. */
export async function reloadDetectionSettings() {
  detection.value = null
  clearDetectionSettingsCache()
  loadPromise = null
  return fetchDetectionSettings(true)
}

export function useDetectionSettings() {
  async function load(force = false) {
    return fetchDetectionSettings(force)
  }

  if (import.meta.client && !detection.value) {
    void load()
  }

  return {
    detection: readonly(detection),
    load,
    catalogKeywords: computed(() => detection.value?.catalogKeywords ?? null),
    lineTypeVerbs: computed(() => detection.value?.lineTypeVerbs ?? null),
  }
}
