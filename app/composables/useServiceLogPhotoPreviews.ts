import type { Ref } from 'vue'

export interface ServiceLogPhotoFile {
  id: string
  originalFilename: string
  mimeType: string
}

/**
 * Loads service log photo previews via authenticated $fetch → blob URLs.
 * Works for any user who can read the parent service log.
 */
export function useServiceLogPhotoPreviews(
  serviceLogId: Ref<string | undefined>,
  files: Ref<ServiceLogPhotoFile[]>,
) {
  const blobUrls = shallowRef(new Map<string, string>())
  const loadingIds = ref(new Set<string>())
  const errorIds = ref(new Set<string>())

  function revokeAll() {
    for (const url of blobUrls.value.values()) URL.revokeObjectURL(url)
    blobUrls.value = new Map()
  }

  async function loadOne(logId: string, file: ServiceLogPhotoFile) {
    if (!file.mimeType.startsWith('image/')) return
    if (blobUrls.value.has(file.id) || loadingIds.value.has(file.id)) return

    const nextLoading = new Set(loadingIds.value)
    nextLoading.add(file.id)
    loadingIds.value = nextLoading

    try {
      const blob = await $fetch<Blob>(
        `/api/service-logs/${logId}/files/${file.id}/preview`,
        { responseType: 'blob' },
      )
      const url = URL.createObjectURL(blob)
      const nextUrls = new Map(blobUrls.value)
      nextUrls.set(file.id, url)
      blobUrls.value = nextUrls
      const nextErrors = new Set(errorIds.value)
      nextErrors.delete(file.id)
      errorIds.value = nextErrors
    }
    catch {
      const nextErrors = new Set(errorIds.value)
      nextErrors.add(file.id)
      errorIds.value = nextErrors
    }
    finally {
      const nextLoading = new Set(loadingIds.value)
      nextLoading.delete(file.id)
      loadingIds.value = nextLoading
    }
  }

  watch(
    [serviceLogId, files],
    async ([logId, list]) => {
      revokeAll()
      errorIds.value = new Set()
      loadingIds.value = new Set()
      if (!logId || !list?.length) return
      await Promise.all(list.map(file => loadOne(logId, file)))
    },
    { immediate: true, deep: true },
  )

  onBeforeUnmount(revokeAll)

  function previewUrl(fileId: string): string {
    return blobUrls.value.get(fileId) ?? ''
  }

  function isLoading(fileId: string): boolean {
    return loadingIds.value.has(fileId)
  }

  function hasError(fileId: string): boolean {
    return errorIds.value.has(fileId)
  }

  const anyLoading = computed(() => loadingIds.value.size > 0)

  return { previewUrl, isLoading, hasError, anyLoading }
}
