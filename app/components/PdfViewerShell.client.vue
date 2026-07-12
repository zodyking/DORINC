<script setup lang="ts">
/**
 * PDF preview — browser-native embed with Acrobat-style toolbar.
 */
const props = withDefaults(defineProps<{
  src?: string
  blob?: Blob | null
  title?: string
  showDownload?: boolean
  downloadHref?: string
  downloadFilename?: string
  showClose?: boolean
  fill?: boolean
}>(), {
  showDownload: true,
  fill: false,
})

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

/** Native PDF chrome (zoom, page nav) when the browser embeds the file. */
const frameSrc = computed(() => {
  if (!displayUrl.value) return ''
  const base = displayUrl.value.split('#')[0] ?? displayUrl.value
  return `${base}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`
})

function openInNewTab() {
  if (!displayUrl.value) return
  window.open(frameSrc.value || displayUrl.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="pdf-viewer" :class="{ 'pdf-viewer--fill': fill }">
    <header class="pdf-viewer__toolbar">
      <div class="pdf-viewer__toolbar-left">
        <span v-if="title" class="pdf-viewer__doc-title">{{ title }}</span>
        <span v-else class="pdf-viewer__doc-title">PDF document</span>
      </div>
      <div class="pdf-viewer__toolbar-right">
        <button
          v-if="displayUrl"
          type="button"
          class="pdf-viewer__toolbtn"
          @click="openInNewTab"
        >
          Open
        </button>
        <a
          v-if="showDownload && downloadHref"
          class="pdf-viewer__toolbtn pdf-viewer__toolbtn--accent"
          :href="downloadHref"
          :download="downloadFilename"
        >Download</a>
        <button
          v-else-if="showDownload"
          type="button"
          class="pdf-viewer__toolbtn pdf-viewer__toolbtn--accent"
          @click="emit('download')"
        >
          Download
        </button>
        <button
          v-if="showClose"
          type="button"
          class="pdf-viewer__toolbtn"
          @click="emit('close')"
        >
          Close
        </button>
      </div>
    </header>
    <div class="pdf-viewer__stage">
      <iframe
        v-if="displayUrl"
        :src="frameSrc"
        class="pdf-viewer__frame"
        :title="title ?? 'PDF preview'"
      />
      <p v-else class="pdf-viewer__empty">No PDF loaded</p>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #2d2d2d;
  border-radius: 10px;
  background: #525659;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.pdf-viewer--fill {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.pdf-viewer__toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  background: linear-gradient(180deg, #3d4044 0%, #323639 100%);
  border-bottom: 1px solid #1e1e1e;
}

.pdf-viewer__toolbar-left {
  min-width: 0;
  flex: 1 1 auto;
}

.pdf-viewer__doc-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #e8eaed;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pdf-viewer__toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.pdf-viewer__toolbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 0 0.75rem;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid #5f6368;
  background: #474a4d;
  color: #f1f3f4;
  cursor: pointer;
  text-decoration: none;
  touch-action: manipulation;
  white-space: nowrap;
}

.pdf-viewer__toolbtn:hover {
  background: #5a5d61;
}

.pdf-viewer__toolbtn--accent {
  background: #4f46e5;
  border-color: #4338ca;
  color: #fff;
}

.pdf-viewer__toolbtn--accent:hover {
  background: #6366f1;
}

.pdf-viewer__stage {
  flex: 1 1 auto;
  min-height: min(82vh, 960px);
  display: flex;
  background: #525659;
}

.pdf-viewer--fill .pdf-viewer__stage {
  flex: 1;
  min-height: 0;
}

.pdf-viewer__frame {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 100%;
  border: 0;
  background: #525659;
}

.pdf-viewer__empty {
  flex: 1;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bdc1c6;
  font-size: 14px;
}

@media (max-width: 640px) {
  .pdf-viewer__toolbar {
    padding: 0.4rem 0.5rem;
  }

  .pdf-viewer__toolbtn {
    min-height: 44px;
    padding: 0 0.65rem;
    font-size: 13px;
  }

  .pdf-viewer__doc-title {
    font-size: 11px;
  }

  .pdf-viewer__stage {
    min-height: min(85dvh, calc(100dvh - 8.5rem));
  }

  .pdf-viewer--fill .pdf-viewer__stage {
    min-height: 0;
    height: 100%;
  }
}
</style>
