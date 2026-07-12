<script setup lang="ts">
import { isBuiltInBladeMarker, isLegacyAccentBladeSource } from '#shared/invoice-template-blade'
import { fetchErrorMessage } from '~/utils/fetch-blob-error'
import { templateOptionLabel } from '~/utils/invoice-template-designer-ui'
import { PdfViewerShell } from '~/utils/pdf-viewer'

interface TemplateListItem {
  id: string
  name: string
  slug: string
  isDefault: boolean
  usageCount: number
  latestVersion: { status: string, versionNumber: number } | null
}

interface TemplateVersionRow {
  id: string
  versionNumber: number
  status: string
  layoutMarker: string
  publishedAt: string | null
}

interface TemplateDetailResponse {
  template: {
    id: string
    name: string
    slug: string
    isDefault: boolean
  }
  latestVersion: TemplateVersionRow | null
  publishedVersion: TemplateVersionRow | null
  usageCount: number
}

type EditorTab = 'code' | 'preview'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const canRead = computed(() => auth.loaded && auth.can('templates.read.all'))
const canManage = computed(() => auth.loaded && auth.can('templates.manage.all'))

const selectedTemplateId = ref<string | null>(null)
const savedBladeSource = ref('')
const bladeSource = ref('')
const templateName = ref('')
const savedTemplateName = ref('')
const editorTab = ref<EditorTab>('code')
const previewBlob = ref<Blob | null>(null)
const { url: previewUrl, setFromBlob: setPreviewBlob, revoke: revokePreviewUrl } = usePdfBlobUrl()
const previewInvoiceLabel = ref('sample invoice')

function clearPreview() {
  revokePreviewUrl()
  previewBlob.value = null
}

const publishBusy = ref(false)
const renameBusy = ref(false)
const previewBusy = ref(false)
const duplicateBusy = ref(false)
const testPdfBusy = ref(false)
const publishError = ref('')
const previewError = ref('')
const actionError = ref('')
const actionMessage = ref('')

const { data: listData, pending: listPending, error: listError, refresh: refreshList } = useFetch<{ items: TemplateListItem[] }>(
  '/api/invoice-templates',
  { server: false, lazy: true, immediate: false },
)

const { data, refresh, pending, error } = useFetch<TemplateDetailResponse>(
  () => selectedTemplateId.value ? `/api/invoice-templates/${selectedTemplateId.value}` : null,
  { watch: [selectedTemplateId], server: false, lazy: true, immediate: false },
)

const { data: previewInvoiceData, refresh: refreshPreviewInvoice } = useFetch<{ preview: { invoiceNumberFormatted: string } | null }>(
  '/api/invoice-templates/preview-invoice',
  { server: false, lazy: true, immediate: false },
)

const bladeDirty = computed(() => bladeSource.value !== savedBladeSource.value)
const nameDirty = computed(() => templateName.value.trim() !== savedTemplateName.value)
const dirty = computed(() => bladeDirty.value || nameDirty.value)

watch(canRead, (allowed) => {
  if (allowed) {
    refreshList()
    refreshPreviewInvoice()
  }
}, { immediate: true })

watch(previewInvoiceData, (row) => {
  if (row?.preview?.invoiceNumberFormatted) {
    previewInvoiceLabel.value = row.preview.invoiceNumberFormatted
  }
}, { immediate: true })

watch(listData, (list) => {
  if (!list?.items.length) return
  const fromQuery = route.query.template as string | undefined
  if (fromQuery && list.items.some(t => t.id === fromQuery)) {
    selectedTemplateId.value = fromQuery
  }
  else if (!selectedTemplateId.value) {
    selectedTemplateId.value = (list.items.find(t => t.isDefault) ?? list.items[0])?.id ?? null
  }
}, { immediate: true })

watch(selectedTemplateId, async (id) => {
  if (!id) return
  await refresh()
  if (route.query.template !== id) {
    await router.replace({ path: '/templates/designer', query: { template: id } })
  }
})

const template = computed(() => data.value?.template ?? null)
const activeVersion = computed(() => data.value?.publishedVersion ?? data.value?.latestVersion ?? null)
const usageCount = computed(() => data.value?.usageCount ?? 0)

async function resolveBladeFromMarker(marker: string): Promise<string> {
  if (isBuiltInBladeMarker(marker) || isLegacyAccentBladeSource(marker)) {
    const baseline = await $fetch<{ source: string }>('/api/invoice-templates/blade-baseline')
    return baseline.source
  }
  return marker
}

watch(template, (row) => {
  if (!row) return
  templateName.value = row.name
  savedTemplateName.value = row.name
}, { immediate: true })

watch(activeVersion, async (v) => {
  if (!v) return
  try {
    const source = await resolveBladeFromMarker(v.layoutMarker)
    bladeSource.value = source
    savedBladeSource.value = source
    clearPreview()
    if (editorTab.value === 'preview') refreshPreview()
  }
  catch (e: unknown) {
    actionError.value = fetchErrorMessage(e, 'Could not load Blade source')
  }
}, { immediate: true })

const loadErrorMessage = computed(() => {
  const err = (error.value ?? listError.value) as { data?: { message?: string }, message?: string } | null
  return err?.data?.message ?? err?.message ?? 'Could not load the invoice template.'
})

async function onTemplateChange(ev: Event) {
  const id = (ev.target as HTMLSelectElement).value
  if (dirty.value && !confirm('You have unsaved changes. Switch template anyway?')) return
  selectedTemplateId.value = id
}

let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null
let previewRequestId = 0

async function refreshPreview(opts?: { switchToPreview?: boolean }) {
  if (!canRead.value || !template.value) return
  const requestId = ++previewRequestId
  previewBusy.value = true
  previewError.value = ''
  try {
    // Render the same dompdf PDF invoices use, so the preview shows the real
    // paginated document (page size, margins, page breaks) instead of raw HTML.
    const source = bladeSource.value.trim()
    const blob = await $fetch<Blob>(`/api/invoice-templates/${template.value.id}/preview-pdf`, {
      method: 'POST',
      body: source.length >= 20 ? { bladeSource: bladeSource.value } : {},
      responseType: 'blob',
    })
    if (requestId !== previewRequestId) return
    previewBlob.value = blob
    setPreviewBlob(blob)
    if (opts?.switchToPreview) editorTab.value = 'preview'
  }
  catch (e: unknown) {
    if (requestId !== previewRequestId) return
    previewError.value = await fetchErrorMessage(e, 'Preview failed — check Blade syntax and PDF service')
    clearPreview()
  }
  finally {
    if (requestId === previewRequestId) previewBusy.value = false
  }
}

function schedulePreviewRefresh() {
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer)
  previewDebounceTimer = setTimeout(() => {
    previewDebounceTimer = null
    if (editorTab.value === 'preview') refreshPreview()
  }, 500)
}

watch(editorTab, (tab) => {
  if (tab === 'preview') refreshPreview()
})

watch(bladeSource, () => {
  if (editorTab.value === 'preview') schedulePreviewRefresh()
})

async function saveTemplateName() {
  if (!canManage.value || !template.value || !nameDirty.value) return
  renameBusy.value = true
  actionError.value = ''
  try {
    const res = await $fetch<{ template: { name: string } }>(`/api/invoice-templates/${template.value.id}`, {
      method: 'PATCH',
      body: { name: templateName.value.trim() },
    })
    savedTemplateName.value = res.template.name
    templateName.value = res.template.name
    await refreshList()
    await refresh()
    actionMessage.value = 'Template name saved'
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Rename failed'
  }
  finally {
    renameBusy.value = false
  }
}

async function publishTemplate() {
  if (!canManage.value || !template.value) return
  publishBusy.value = true
  publishError.value = ''
  try {
    if (nameDirty.value) await saveTemplateName()
    await $fetch(`/api/invoice-templates/${template.value.id}/publish`, {
      method: 'POST',
      body: { bladeSource: bladeSource.value },
    })
    savedBladeSource.value = bladeSource.value
    await refresh()
    await refreshList()
    actionMessage.value = 'Template published'
    await refreshPreview({ switchToPreview: true })
  }
  catch (e: unknown) {
    publishError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Save failed'
  }
  finally {
    publishBusy.value = false
  }
}

async function duplicateTemplate() {
  if (!canManage.value || !template.value) return
  duplicateBusy.value = true
  actionError.value = ''
  try {
    const detail = await $fetch<TemplateDetailResponse>(
      `/api/invoice-templates/${template.value.id}/duplicate`,
      { method: 'POST', body: {} },
    )
    await refreshList()
    selectedTemplateId.value = detail.template.id
    actionMessage.value = `Duplicated as ${detail.template.name}`
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Duplicate failed'
  }
  finally {
    duplicateBusy.value = false
  }
}

async function setDefaultTemplate() {
  if (!canManage.value || !template.value || template.value.isDefault) return
  actionError.value = ''
  try {
    await $fetch(`/api/invoice-templates/${template.value.id}`, { method: 'PATCH', body: { isDefault: true } })
    await refresh()
    await refreshList()
    actionMessage.value = 'Set as default template'
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not set default'
  }
}

async function testRenderPdf() {
  if (!canManage.value || !template.value) return
  testPdfBusy.value = true
  actionError.value = ''
  try {
    await $fetch(`/api/invoice-templates/${template.value.id}/test-pdf`, {
      method: 'POST',
      body: { bladeSource: bladeSource.value },
    })
    actionMessage.value = 'Test PDF queued — check downloads shortly.'
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Test render failed'
  }
  finally {
    testPdfBusy.value = false
  }
}

function resetBlade() {
  if (dirty.value && !confirm('Reset all changes to the last loaded version?')) return
  bladeSource.value = savedBladeSource.value
  clearPreview()
  if (editorTab.value === 'preview') refreshPreview()
}

const bladeEditorRef = ref<HTMLTextAreaElement | null>(null)

async function copyBladeSource() {
  const el = bladeEditorRef.value
  const hasSelection = !!el && el.selectionStart !== el.selectionEnd
  const text = hasSelection
    ? bladeSource.value.slice(el!.selectionStart, el!.selectionEnd)
    : bladeSource.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    actionMessage.value = hasSelection ? 'Selection copied to clipboard' : 'Blade source copied to clipboard'
    actionError.value = ''
  }
  catch {
    actionError.value = 'Could not copy — check browser clipboard permission'
  }
}

async function pasteBladeFromClipboard() {
  if (!canManage.value) return
  const el = bladeEditorRef.value
  if (!el) return
  try {
    const text = await navigator.clipboard.readText()
    if (!text) return
    const start = el.selectionStart
    const end = el.selectionEnd
    bladeSource.value = `${bladeSource.value.slice(0, start)}${text}${bladeSource.value.slice(end)}`
    await nextTick()
    const caret = start + text.length
    el.focus()
    el.setSelectionRange(caret, caret)
    actionMessage.value = 'Pasted from clipboard'
    actionError.value = ''
  }
  catch {
    actionError.value = 'Could not paste — allow clipboard access in your browser'
  }
}
</script>

<template>
  <div v-if="!auth.loaded" class="cp-state">Loading template editor…</div>
  <div v-else-if="!canRead" class="cp-state">You do not have permission to view invoice templates.</div>
  <div v-else-if="listPending && !listData" class="cp-state">Loading template editor…</div>
  <div v-else-if="listError" class="cp-state">{{ loadErrorMessage }}</div>
  <div v-else-if="!selectedTemplateId" class="cp-state">No invoice templates found.</div>
  <div v-else-if="pending && !data" class="cp-state">Loading template editor…</div>
  <div v-else-if="error || !template" class="cp-state">{{ loadErrorMessage }}</div>

  <div v-else class="te-page">
    <div class="card te-toolbar">
      <div class="te-toolbar__main">
        <label class="te-field">
          <span>Template name</span>
          <input v-model="templateName" type="text" maxlength="120" :disabled="!canManage">
        </label>
        <label class="te-field">
          <span>Template</span>
          <select :value="selectedTemplateId ?? ''" @change="onTemplateChange">
            <option v-for="t in listData?.items ?? []" :key="t.id" :value="t.id">
              {{ templateOptionLabel(t.name, t.isDefault, t.latestVersion?.status) }}
            </option>
          </select>
        </label>
        <div class="te-badges">
          <span v-if="template.isDefault" class="pill ok">Default</span>
          <span class="pill indigo">Laravel Blade</span>
        </div>
      </div>
      <div class="te-toolbar__actions">
        <button v-if="canManage && nameDirty" type="button" class="btn" :disabled="renameBusy" @click="saveTemplateName">
          {{ renameBusy ? 'Saving…' : 'Save name' }}
        </button>
        <button v-if="canManage" type="button" class="btn" :disabled="duplicateBusy" @click="duplicateTemplate">
          {{ duplicateBusy ? 'Duplicating…' : 'Duplicate' }}
        </button>
        <button v-if="canManage" type="button" class="btn" :disabled="testPdfBusy" @click="testRenderPdf">
          {{ testPdfBusy ? 'Queuing…' : 'Test PDF' }}
        </button>
        <button v-if="canManage && !template.isDefault" type="button" class="btn" @click="setDefaultTemplate">
          Set default
        </button>
        <button v-if="canManage" type="button" class="btn primary" :disabled="publishBusy || !dirty" @click="publishTemplate">
          {{ publishBusy ? 'Saving…' : 'Save template' }}
        </button>
      </div>
    </div>

    <p v-if="publishError" class="te-msg te-msg--err">{{ publishError }}</p>
    <p v-if="previewError" class="te-msg te-msg--err">{{ previewError }}</p>
    <p v-if="actionError" class="te-msg te-msg--err">{{ actionError }}</p>
    <p v-if="actionMessage" class="te-msg te-msg--ok">{{ actionMessage }}</p>

    <div class="card te-workspace">
      <div class="te-workspace__head">
        <div class="te-tabs" role="tablist">
          <button type="button" class="te-tab" :class="{ active: editorTab === 'code' }" @click="editorTab = 'code'">
            Blade code
          </button>
          <button type="button" class="te-tab" :class="{ active: editorTab === 'preview' }" @click="editorTab = 'preview'">
            PDF preview
          </button>
        </div>
        <div class="te-workspace__actions">
          <template v-if="editorTab === 'code'">
            <button
              type="button"
              class="btn sm ghost"
              :disabled="!bladeSource"
              title="Copy all Blade source (or current selection)"
              @click="copyBladeSource"
            >
              Copy
            </button>
            <button
              v-if="canManage"
              type="button"
              class="btn sm ghost"
              title="Paste clipboard at cursor"
              @click="pasteBladeFromClipboard"
            >
              Paste
            </button>
          </template>
          <button type="button" class="btn sm ghost" :disabled="!bladeDirty" @click="resetBlade">Reset</button>
        </div>
      </div>

      <div v-show="editorTab === 'code'" class="te-pane te-pane--code">
        <textarea
          ref="bladeEditorRef"
          v-model="bladeSource"
          class="td-code te-blade-editor"
          spellcheck="false"
          :disabled="!canManage"
          aria-label="Invoice template Blade source"
        />
        <p class="te-pane__hint">
          Invoice layout is controlled entirely by this Blade template. Sample data renders from {{ previewInvoiceLabel }}.
          <span v-if="dirty" class="dirty">Unsaved changes.</span>
        </p>
      </div>

      <div v-show="editorTab === 'preview'" class="te-pane te-pane--preview">
        <div v-if="previewBusy" class="te-preview-loading">Rendering PDF preview…</div>
        <ClientOnly v-if="previewUrl">
          <PdfViewerShell
            fill
            compact
            :src="previewUrl"
            :blob="previewBlob"
            :title="`Template preview — ${previewInvoiceLabel}`"
            :show-download="false"
          />
          <template #fallback>
            <p class="te-preview-empty">Loading viewer…</p>
          </template>
        </ClientOnly>
        <p v-else-if="!previewBusy" class="te-preview-empty">
          Preview renders automatically when you open this tab.
        </p>
      </div>

      <div class="te-meta">
        <span>Version {{ activeVersion?.versionNumber ?? '—' }} · {{ activeVersion?.status ?? '—' }}</span>
        <span>{{ usageCount }} invoice{{ usageCount === 1 ? '' : 's' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.te-page { display: flex; flex-direction: column; gap: 12px; }
.te-toolbar {
  display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 16px 18px;
}
.te-toolbar__main { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; flex: 1; }
.te-toolbar__actions { display: flex; gap: 8px; flex-wrap: wrap; }
.te-field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; }
.te-field span {
  font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #94a3b8;
}
.te-badges { display: flex; gap: 6px; align-items: center; padding-bottom: 2px; }
.te-msg { margin: 0; font-size: 13px; }
.te-msg--err { color: #dc2626; }
.te-msg--ok { color: #059669; }
.te-workspace { overflow: hidden; }
.te-workspace__head {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 0 12px; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap;
}
.te-workspace__actions { display: flex; gap: 8px; padding: 10px 0; }
.te-tabs { display: flex; gap: 0; }
.te-tab {
  appearance: none; border: none; background: transparent; padding: 14px 16px;
  font: inherit; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.te-tab.active { color: #4f46e5; border-bottom-color: #4f46e5; }
.te-pane { min-height: 520px; }
.te-pane--code { padding: 12px 14px 0; display: flex; flex-direction: column; }
.te-blade-editor { flex: 1; min-height: 480px; resize: vertical; }
.te-pane__hint { margin: 10px 0 14px; font-size: 12px; color: #64748b; }
.te-pane__hint .dirty { color: #d97706; font-weight: 700; }
.te-pane--preview {
  background: #eef0f4;
  min-height: min(62vh, 720px);
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 12px;
}

@media (max-width: 640px) {
  .te-pane--preview {
    min-height: 0;
    height: min(50dvh, 440px);
    max-height: min(50dvh, 440px);
    padding: 8px;
  }
}
.te-preview-loading {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(238, 240, 244, 0.92); color: #64748b; font-size: 14px; font-weight: 600; z-index: 1;
}
.te-pane--preview :deep(.pdf-shell) { flex: 1; min-height: 0; }
.te-preview-empty {
  margin: 0; padding: 48px 24px; text-align: center; color: #64748b; font-size: 14px; line-height: 1.5;
}
.te-meta {
  display: flex; justify-content: space-between; gap: 12px; padding: 10px 16px;
  border-top: 1px solid #f1f5f9; font-size: 12px; color: #94a3b8;
}
</style>
