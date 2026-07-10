import type { CatalogKeywordMap, LineTypeVerbSettings } from '#shared/workspace-settings-defaults'
import { setDetectionSettingsCache } from '~/utils/detection-settings-store'

const detection = ref<{
  catalogKeywords: CatalogKeywordMap
  lineTypeVerbs: LineTypeVerbSettings
} | null>(null)

let loadPromise: Promise<void> | null = null

export function useDetectionSettings() {
  async function load() {
    if (detection.value) return detection.value
    if (!loadPromise) {
      loadPromise = $fetch<{
        catalogKeywords: CatalogKeywordMap
        lineTypeVerbs: LineTypeVerbSettings
      }>('/api/settings/detection')
        .then((data) => {
          detection.value = data
          setDetectionSettingsCache(data)
        })
        .catch(() => {
          detection.value = null
        })
        .finally(() => {
          loadPromise = null
        })
    }
    await loadPromise
    return detection.value
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
