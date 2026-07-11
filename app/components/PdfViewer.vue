<script setup lang="ts">
const props = defineProps<{
  src: string
  title?: string
  showDownload?: boolean
  showToolbar?: boolean
}>()

const emit = defineEmits<{
  download: []
}>()

const loadError = ref(false)

/** Browser-native PDF chrome (zoom, paging) — sharp rendering via built-in PDF engine. */
const frameSrc = computed(() => {
  if (!props.src) return ''
  const base = props.src.split('#')[0]!
  return `${base}#toolbar=1&navpanes=0&view=FitH`
})

function onFrameError() {
  loadError.value = true
}

watch(() => props.src, () => {
  loadError.value = false
})

function openDirect() {
  if (!props.src) return
  window.open(props.src, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="pdf-viewer">
    <div v-if="showToolbar !== false" class="pdf-viewer__toolbar">
      <div v-if="showDownload !== false" class="pdf-viewer__actions">
        <button type="button" class="btn sm" @click="emit('download')">Download</button>
        <button type="button" class="btn sm" @click="openDirect">Open in new tab</button>
      </div>
    </div>

    <div class="pdf-viewer__body">
      <div v-if="loadError" class="pdf-viewer__fallback">
        <p>This browser could not display the PDF inline.</p>
        <button type="button" class="btn sm" @click="openDirect">Open PDF</button>
      </div>
      <object
        v-else
        :data="frameSrc"
        type="application/pdf"
        class="pdf-viewer__object"
        :title="title ?? 'PDF document'"
        @error="onFrameError"
      >
        <iframe
          :src="frameSrc"
          class="pdf-viewer__frame"
          :title="title ?? 'PDF document'"
          @error="onFrameError"
        />
      </object>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  display: flex;
  flex-direction: column;
  min-height: min(80vh, 960px);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #525659;
}
.pdf-viewer__toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 10px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.pdf-viewer__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pdf-viewer__body {
  flex: 1;
  display: flex;
  min-height: 420px;
}
.pdf-viewer__object,
.pdf-viewer__frame {
  flex: 1;
  width: 100%;
  min-height: 420px;
  border: none;
  background: #525659;
}
.pdf-viewer__fallback {
  margin: auto;
  text-align: center;
  padding: 32px 20px;
  color: #e2e8f0;
  font-size: 13px;
  line-height: 1.5;
}
.pdf-viewer__fallback p {
  margin: 0 0 12px;
}
</style>
