<script setup lang="ts">
const props = defineProps<{
  src: string
  title?: string
  showDownload?: boolean
}>()

const emit = defineEmits<{
  download: []
}>()

/** Browser-native PDF chrome (zoom, paging) — works with blob URLs in Chromium & Safari. */
const frameSrc = computed(() => {
  if (!props.src) return ''
  const base = props.src.split('#')[0]!
  return `${base}#toolbar=1&navpanes=0&view=FitH`
})
</script>

<template>
  <div class="pdf-native-viewer">
    <div v-if="showDownload !== false" class="pdf-native-viewer__bar">
      <button type="button" class="btn sm" @click="emit('download')">Download</button>
      <a :href="src" class="btn sm" target="_blank" rel="noopener noreferrer">Open in new tab</a>
    </div>
    <iframe
      :src="frameSrc"
      class="pdf-native-viewer__frame"
      :title="title ?? 'PDF document'"
    />
  </div>
</template>

<style scoped>
.pdf-native-viewer {
  display: flex;
  flex-direction: column;
  min-height: min(80vh, 960px);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: #525659;
}
.pdf-native-viewer__bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 8px 10px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.pdf-native-viewer__frame {
  flex: 1;
  width: 100%;
  min-height: 420px;
  border: none;
  background: #525659;
}
</style>
