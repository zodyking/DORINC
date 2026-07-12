<script setup lang="ts">
/**
 * TripBuddy-style full-screen PDF dialog — overlay + PdfViewerShell.
 */
import PdfViewerShell from '~/components/PdfViewerShell.client.vue'

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  src?: string
  blob?: Blob | null
  title?: string
  showDownload?: boolean
  downloadHref?: string
  downloadFilename?: string
}>()

const emit = defineEmits<{
  close: []
  download: []
}>()

function close() {
  open.value = false
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && (src || blob)"
      class="pdf-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title ?? 'PDF preview'"
    >
      <div class="pdf-dialog__backdrop" @click="close" />
      <div class="pdf-dialog__panel" @click.stop>
        <PdfViewerShell
          fill
          :src="src"
          :blob="blob"
          :title="title"
          :show-download="showDownload !== false"
          :download-href="downloadHref"
          :download-filename="downloadFilename"
          show-close
          @close="close"
          @download="emit('download')"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pdf-dialog {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  align-items: stretch;
  justify-content: center;
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100dvh;
  height: 100vh;
  height: 100dvh;
  padding: env(safe-area-inset-top, 0) max(env(safe-area-inset-right), 0.5rem)
    env(safe-area-inset-bottom, 0) max(env(safe-area-inset-left), 0.5rem);
}

@media (max-width: 640px) {
  .pdf-dialog {
    padding: env(safe-area-inset-top, 0) env(safe-area-inset-right, 0)
      env(safe-area-inset-bottom, 0) env(safe-area-inset-left, 0);
  }
}

.pdf-dialog__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.72);
}

.pdf-dialog__panel {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(960px, 100%);
  align-self: stretch;
  min-height: 0;
  height: 100%;
  max-height: min(100dvh, 100%);
  overflow: hidden;
}

@media (max-width: 640px) {
  .pdf-dialog__panel {
    width: 100%;
    max-width: 100%;
  }

  .pdf-dialog__panel :deep(.pdf-panel) {
    border-radius: 0;
    box-shadow: none;
  }
}
</style>
