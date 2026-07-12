<script setup lang="ts">
/**
 * PDF preview — native browser embed (iframe). No pdf.js, no custom canvas.
 */
const props = defineProps<{
  src?: string
  blob?: Blob | null
  title?: string
  showDownload?: boolean
  downloadHref?: string
  downloadFilename?: string
  showClose?: boolean
  fill?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{
  close: []
  download: []
}>()

const displayUrl = ref('')
let ownedBlobUrl = ''

function setUrl(url: string) {
  if (ownedBlobUrl && ownedBlobUrl !== url) {
    URL.revokeObjectURL(ownedBlobUrl)
    ownedBlobUrl = ''
  }
  displayUrl.value = url
}

watch(() => [props.src, props.blob] as const, ([src, blob]) => {
  if (src) {
    setUrl(src)
    return
  }
  if (blob) {
    const url = URL.createObjectURL(blob)
    ownedBlobUrl = url
    displayUrl.value = url
    return
  }
  setUrl('')
}, { immediate: true })

onUnmounted(() => {
  if (ownedBlobUrl) URL.revokeObjectURL(ownedBlobUrl)
})
</script>

<template>
  <div class="pdf-panel" :class="{ 'pdf-panel--fill': fill }">
    <header
      v-if="showDownload || showClose || (title && !compact)"
      class="pdf-panel__bar"
    >
      <h3 v-if="title && !compact" class="pdf-panel__title">{{ title }}</h3>
      <div class="pdf-panel__actions">
        <a
          v-if="showDownload && downloadHref"
          class="pdf-panel__btn pdf-panel__btn--primary"
          :href="downloadHref"
          :download="downloadFilename"
        >Download PDF</a>
        <button
          v-else-if="showDownload"
          type="button"
          class="pdf-panel__btn pdf-panel__btn--primary"
          @click="emit('download')"
        >
          Download PDF
        </button>
        <button
          v-if="showClose"
          type="button"
          class="pdf-panel__btn"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
    </header>
    <div class="pdf-panel__body">
      <iframe
        v-if="displayUrl"
        :src="displayUrl"
        class="pdf-panel__embed"
        :title="title ?? 'PDF preview'"
      />
      <p v-else class="pdf-panel__empty">No PDF loaded</p>
    </div>
  </div>
</template>

<style scoped>
.pdf-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}

.pdf-panel--fill {
  flex: 1;
  min-height: 0;
}

.pdf-panel__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.pdf-panel__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.pdf-panel__actions {
  display: flex;
  gap: 0.35rem;
  margin-left: auto;
}

.pdf-panel__btn {
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #334155;
  cursor: pointer;
  text-decoration: none;
}

.pdf-panel__btn--primary {
  color: #fff;
  background: #4f46e5;
  border-color: #4338ca;
}

.pdf-panel__body {
  flex: 1;
  min-height: min(70vh, 800px);
  display: flex;
  background: #525659;
}

.pdf-panel--fill .pdf-panel__body {
  min-height: 0;
}

.pdf-panel__embed {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 480px;
  border: 0;
  background: #fff;
}

.pdf-panel__empty {
  flex: 1;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 13px;
}

@media (max-width: 640px) {
  .pdf-panel__body {
    min-height: min(55dvh, 520px);
  }

  .pdf-panel--fill .pdf-panel__body {
    min-height: 0;
  }

  .pdf-panel__embed {
    min-height: 0;
  }
}
</style>
