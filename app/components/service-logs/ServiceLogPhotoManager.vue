<script setup lang="ts">
import ServiceLogImageGallery from '~/components/service-logs/ServiceLogImageGallery.vue'
import type { ServiceLogPhotoFile } from '~/composables/useServiceLogPhotoPreviews'

const props = defineProps<{
  serviceLogId: string
  files: ServiceLogPhotoFile[]
  editable?: boolean
}>()

const emit = defineEmits<{
  refreshed: []
}>()

const galleryIndex = ref(0)
const uploadBusy = ref(false)
const deleteBusy = ref(false)
const photoError = ref('')

const imageFiles = computed(() => props.files.filter(f => f.mimeType.startsWith('image/')))
const activeFile = computed(() => imageFiles.value[galleryIndex.value] ?? null)
const busy = computed(() => uploadBusy.value || deleteBusy.value)

watch(imageFiles, (imgs) => {
  if (!imgs.length) {
    galleryIndex.value = 0
    return
  }
  if (galleryIndex.value >= imgs.length) galleryIndex.value = imgs.length - 1
}, { immediate: true })

async function uploadPhotos(input: Event) {
  if (!props.editable || busy.value) return
  const el = input.target as HTMLInputElement
  const picked = el.files ? Array.from(el.files) : []
  el.value = ''
  if (!picked.length) return

  uploadBusy.value = true
  photoError.value = ''
  try {
    for (const file of picked) {
      const body = new FormData()
      body.append('file', file, file.name)
      await $fetch(`/api/service-logs/${props.serviceLogId}/files`, { method: 'POST', body })
    }
    emit('refreshed')
    galleryIndex.value = Math.max(0, imageFiles.value.length)
  }
  catch (e: unknown) {
    photoError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Upload failed'
  }
  finally {
    uploadBusy.value = false
  }
}

async function deleteActivePhoto() {
  const file = activeFile.value
  if (!props.editable || !file || busy.value) return
  if (!confirm(`Remove "${file.originalFilename}" from this service log?`)) return

  deleteBusy.value = true
  photoError.value = ''
  try {
    await $fetch(`/api/service-logs/${props.serviceLogId}/files/${file.id}/archive`, { method: 'POST' })
    emit('refreshed')
  }
  catch (e: unknown) {
    photoError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not remove photo'
  }
  finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <div class="sl-photo-manager">
    <ServiceLogImageGallery
      v-if="imageFiles.length"
      v-model="galleryIndex"
      :service-log-id="serviceLogId"
      :files="imageFiles"
      :editable="editable"
      :delete-busy="deleteBusy"
      @delete="deleteActivePhoto"
    />

    <div v-else-if="editable" class="sl-photo-empty">
      <p>No photos yet — add field photos below.</p>
    </div>

    <label v-if="editable" class="sl-photo-zone">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        :disabled="busy"
        @change="uploadPhotos"
      >
      <div class="sl-photo-inner">
        <span class="ico">📷</span>
        <b>{{ uploadBusy ? 'Uploading…' : 'Add photos' }}</b>
        <span>Tap to take or choose images</span>
      </div>
    </label>

    <p v-if="photoError" class="help sl-photo-error">{{ photoError }}</p>
  </div>
</template>

<style scoped>
.sl-photo-manager {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sl-photo-empty {
  padding: 20px 16px;
  border: 1px dashed #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  text-align: center;
}

.sl-photo-empty p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.sl-photo-error {
  margin: 0;
  color: #dc2626;
}
</style>
