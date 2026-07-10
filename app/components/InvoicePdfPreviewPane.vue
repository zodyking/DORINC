<script setup lang="ts">
import { fetchErrorMessage } from '~/utils/fetch-blob-error'

const props = defineProps<{
  invoiceId: string
  invoiceLabel: string
  /** When true, prefer stored official PDF for finalized invoices. */
  preferOfficial?: boolean
  hasOfficialPdf?: boolean
  canGeneratePdf?: boolean
}>()

const emit = defineEmits<{ refreshed: [] }>()

const auth = useAuthStore()
const canUse = computed(() => props.canGeneratePdf !== false && auth.can('invoices.generate_pdf.all'))

const busy = ref(false)
const downloadBusy = ref(false)
const error = ref('')
const previewUrl = ref('')

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

async function fetchPreviewBlob() {
  return await $fetch<Blob>(`/api/invoices/${props.invoiceId}/preview-pdf`, {
    responseType: 'blob',
  })
}

async function fetchOfficialBlob() {
  return await $fetch<Blob>(`/api/invoices/${props.invoiceId}/pdf`, {
    responseType: 'blob',
  })
}

async function loadPreview() {
  if (!canUse.value) return
  busy.value = true
  error.value = ''
  revokePreview()
  try {
    if (props.preferOfficial && props.hasOfficialPdf) {
      try {
        const blob = await fetchOfficialBlob()
        previewUrl.value = URL.createObjectURL(blob)
        return
      }
      catch {
        // Fall back to live preview if official file unavailable.
      }
    }
    const blob = await fetchPreviewBlob()
    previewUrl.value = URL.createObjectURL(blob)
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'Could not render PDF preview')
  }
  finally {
    busy.value = false
  }
}

async function downloadPdf() {
  if (!canUse.value) return
  downloadBusy.value = true
  error.value = ''
  try {
    if (props.preferOfficial) {
      if (!props.hasOfficialPdf) {
        await $fetch(`/api/invoices/${props.invoiceId}/generate-pdf`, { method: 'POST' })
        emit('refreshed')
      }
      try {
        const blob = await fetchOfficialBlob()
        triggerBrowserDownload(blob, `${props.invoiceLabel}.pdf`)
        return
      }
      catch {
        // Official file may still be rendering.
      }
    }
    const blob = await fetchPreviewBlob()
    triggerBrowserDownload(blob, `${props.invoiceLabel}.pdf`)
  }
  catch (e: unknown) {
    error.value = await fetchErrorMessage(e, 'PDF download failed')
  }
  finally {
    downloadBusy.value = false
  }
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

onMounted(() => {
  if (canUse.value) void loadPreview()
})

watch(() => [props.invoiceId, props.hasOfficialPdf, props.preferOfficial], () => {
  if (canUse.value) void loadPreview()
})

onUnmounted(() => {
  revokePreview()
})

defineExpose({ refresh: loadPreview })
</script>

<template>
  <div v-if="!canUse" class="invoice-pdf-pane-empty">
    You do not have permission to preview invoice PDFs.
  </div>
  <div v-else class="invoice-pdf-pane">
    <div class="invoice-pdf-pane-toolbar">
      <span class="pill indigo">Laravel DomPDF</span>
      <div style="display:flex; gap:8px; margin-left:auto;">
        <button type="button" class="btn sm" :disabled="busy" @click="loadPreview">
          {{ busy ? 'Rendering…' : 'Refresh' }}
        </button>
        <button type="button" class="btn sm" :disabled="downloadBusy" @click="downloadPdf">
          {{ downloadBusy ? 'Preparing…' : 'Download' }}
        </button>
      </div>
    </div>
    <p v-if="error" class="invoice-pdf-pane-error">{{ error }}</p>
    <p v-else-if="busy && !previewUrl" class="invoice-pdf-pane-empty">Rendering invoice PDF…</p>
    <iframe
      v-else-if="previewUrl"
      :src="previewUrl"
      class="invoice-pdf-pane-frame"
      :title="`${invoiceLabel} PDF preview`"
    />
    <p v-else class="invoice-pdf-pane-empty">No preview available.</p>
  </div>
</template>

<style scoped>
.invoice-pdf-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 480px;
}
.invoice-pdf-pane-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.invoice-pdf-pane-frame {
  width: 100%;
  min-height: min(960px, calc(100vh - 14rem));
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #eef0f4;
}
.invoice-pdf-pane-empty,
.invoice-pdf-pane-error {
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: #64748b;
  padding: 48px 16px;
}
.invoice-pdf-pane-error {
  color: #dc2626;
}
</style>
