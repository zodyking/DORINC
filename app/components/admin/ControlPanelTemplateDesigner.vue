<script setup lang="ts">
import {
  publishStatusLabel,
  templateOptionLabel,
  versionStatusLabel,
  type InvoiceTemplateDesignSettings,
} from '~/utils/invoice-template-designer-ui'
import { fetchErrorMessage } from '~/utils/fetch-blob-error'

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
  bladeSource?: string | null
  designSettings: InvoiceTemplateDesignSettings
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

type PreviewTab = 'pdf' | 'html'

const BLADE_SNIPPETS = [
  { label: '$doc[\'number\']', insert: '{{ $doc[\'number\'] }}' },
  { label: 'customer', insert: '{{ $customer[\'name\'] ?? \'\' }}' },
  { label: 'sectionVisible', insert: '@if($sectionVisible(\'customer\'))\n@endif' },
  { label: 'lineItems', insert: '@foreach(($doc[\'lineItems\'] ?? []) as $line)\n@endforeach' },
  { label: 'accent', insert: '{{ $doc[\'design\'][\'accentColor\'] ?? \'#2563eb\' }}' },
] as const

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const authPending = computed(() => !auth.loaded)
const canRead = computed(() => auth.loaded && auth.can('templates.read.all'))
const canManage = computed(() => auth.loaded && auth.can('templates.manage.all'))

const selectedTemplateId = ref<string | null>(null)
const editorOpen = ref(false)
const bladeSource = ref('')
const savedBladeSource = ref('')
const builtinBladeSource = ref('')

const publishBusy = ref(false)
const publishError = ref('')
const actionError = ref('')
const actionMessage = ref('')
const duplicateBusy = ref(false)

const previewTab = ref<PreviewTab>('pdf')
const previewBusy = ref(false)
const previewError = ref('')
const previewUrl = ref('')
const previewHtml = ref('')
const previewInvoiceLabel = ref('sample invoice')
let previewTimer: ReturnType<typeof setTimeout> | null = null
let previewSeq = 0

const { data: listData, pending: listPending, error: listError, refresh: refreshList } = useFetch<{ items: TemplateListItem[] }>(
  '/api/invoice-templates',
  { server: false, lazy: true, immediate: false },
)

const { data, refresh, pending, error } = useFetch<TemplateDetailResponse>(
  () => selectedTemplateId.value
    ? `/api/invoice-templates/${selectedTemplateId.value}`
    : null,
  {
    watch: [selectedTemplateId],
    server: false,
    lazy: true,
    immediate: false,
  },
)

const { data: previewInvoiceData, refresh: refreshPreviewInvoice } = useFetch<{ preview: { invoiceNumberFormatted: string } | null }>(
  '/api/invoice-templates/preview-invoice',
  { server: false, lazy: true, immediate: false },
)

const dirty = computed(() => bladeSource.value !== savedBladeSource.value)

watch(canRead, async (allowed) => {
  if (!allowed) return
  refreshList()
  refreshPreviewInvoice()
  try {
    const res = await $fetch<{ bladeSource: string }>('/api/invoice-templates/blade-default')
    builtinBladeSource.value = res.bladeSource
  }
  catch {
    builtinBladeSource.value = ''
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
    const def = list.items.find(t => t.isDefault) ?? list.items[0]
    selectedTemplateId.value = def?.id ?? null
  }
}, { immediate: true })

watch(selectedTemplateId, async (id) => {
  if (!id) return
  await refresh()
  if (route.query.template !== id) {
    await router.replace({ query: { ...route.query, tab: 'designer', template: id } })
  }
})

const template = computed(() => data.value?.template ?? null)
const activeVersion = computed(() => data.value?.publishedVersion ?? data.value?.latestVersion ?? null)
const usageCount = computed(() => data.value?.usageCount ?? 0)

function resolveBladeForVersion(version: TemplateVersionRow | null): string {
  const custom = version?.bladeSource?.trim()
  if (custom) return custom
  return builtinBladeSource.value
}

watch([activeVersion, builtinBladeSource], ([version]) => {
  if (!version) return
  const next = resolveBladeForVersion(version)
  if (!editorOpen.value || !dirty.value) {
    bladeSource.value = next
    savedBladeSource.value = next
  }
}, { immediate: true })

watch(() => route.query.editor, (value) => {
  if (value === '1' || value === 'true') editorOpen.value = true
}, { immediate: true })

const statusText = computed(() => {
  const v = activeVersion.value
  if (!v) return 'Loading template…'
  if (dirty.value) return 'Unsaved Blade changes'
  return publishStatusLabel(v.publishedAt, v.versionNumber, usageCount.value)
})

const versionMeta = computed(() => {
  const v = activeVersion.value
  if (!v) return '—'
  return versionStatusLabel(v.status, v.versionNumber)
})

const loadErrorMessage = computed(() => {
  const err = (error.value ?? listError.value) as {
    data?: { message?: string, data?: { message?: string } }
    message?: string
    statusMessage?: string
  } | null
  if (!err) return 'Could not load the invoice template.'
  const nested = err.data?.data?.message ?? err.data?.message
  if (nested) return nested
  const generic = err.message ?? err.statusMessage
  if (generic && generic !== 'Server Error') return generic
  return 'Could not load the invoice template.'
})

function revokePreview() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

async function refreshPreviews() {
  if (!canRead.value || !template.value || !bladeSource.value.trim()) return
  const seq = ++previewSeq
  previewBusy.value = true
  previewError.value = ''
  try {
    const body = { bladeSource: bladeSource.value }
    const [pdfBlob, htmlRes] = await Promise.all([
      $fetch<Blob>(`/api/invoice-templates/${template.value.id}/preview-pdf`, {
        method: 'POST',
        body,
        responseType: 'blob',
      }),
      $fetch<{ html: string, previewInvoiceNumber?: string }>(
        `/api/invoice-templates/${template.value.id}/preview-html`,
        { method: 'POST', body },
      ),
    ])
    if (seq !== previewSeq) return
    revokePreview()
    previewUrl.value = URL.createObjectURL(pdfBlob)
    previewHtml.value = htmlRes.html
    if (htmlRes.previewInvoiceNumber) previewInvoiceLabel.value = htmlRes.previewInvoiceNumber
  }
  catch (e: unknown) {
    if (seq !== previewSeq) return
    previewError.value = await fetchErrorMessage(e, 'Preview failed — check Blade syntax / PDF service')
    revokePreview()
    previewHtml.value = ''
  }
  finally {
    if (seq === previewSeq) previewBusy.value = false
  }
}

function schedulePreviewRefresh() {
  if (!editorOpen.value) return
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    void refreshPreviews()
  }, 450)
}

watch(bladeSource, () => {
  if (editorOpen.value) schedulePreviewRefresh()
})

watch(editorOpen, async (open) => {
  const nextQuery = { ...route.query, tab: 'designer' as const }
  if (open) {
    nextQuery.editor = '1'
    if (!bladeSource.value.trim()) {
      bladeSource.value = resolveBladeForVersion(activeVersion.value)
      savedBladeSource.value = bladeSource.value
    }
    await refreshPreviews()
  }
  else {
    delete nextQuery.editor
  }
  if (route.query.template) nextQuery.template = String(route.query.template)
  await router.replace({ query: nextQuery })
})

function onTemplateChange(ev: Event) {
  const id = (ev.target as HTMLSelectElement).value
  if ((dirty.value || editorOpen.value) && !confirm('You have unsaved editor changes. Switch template anyway?')) {
    ;(ev.target as HTMLSelectElement).value = selectedTemplateId.value ?? ''
    return
  }
  selectedTemplateId.value = id
  editorOpen.value = false
}

function openEditor() {
  editorOpen.value = true
}

function closeEditor() {
  if (dirty.value && !confirm('Close without saving Blade changes?')) return
  bladeSource.value = savedBladeSource.value
  editorOpen.value = false
}

function resetBlade() {
  if (!activeVersion.value) return
  if (dirty.value && !confirm('Reset Blade source to the last published version?')) return
  bladeSource.value = resolveBladeForVersion(activeVersion.value)
  savedBladeSource.value = bladeSource.value
  schedulePreviewRefresh()
}

function insertSnippet(text: string) {
  bladeSource.value = `${bladeSource.value.trimEnd()}\n${text}\n`
}

async function publishTemplate() {
  if (!canManage.value || !template.value) return
  publishBusy.value = true
  publishError.value = ''
  try {
    await $fetch(`/api/invoice-templates/${template.value.id}/publish`, {
      method: 'POST',
      body: { bladeSource: bladeSource.value },
    })
    savedBladeSource.value = bladeSource.value
    await refresh()
    await refreshList()
    actionMessage.value = 'Template saved and published'
    await refreshPreviews()
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
    editorOpen.value = false
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
    await $fetch(`/api/invoice-templates/${template.value.id}`, {
      method: 'PATCH',
      body: { isDefault: true },
    })
    await refresh()
    await refreshList()
    actionMessage.value = 'Set as system default template'
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Could not set default'
  }
}

onUnmounted(() => {
  if (previewTimer) clearTimeout(previewTimer)
  revokePreview()
})
</script>

<template>
  <div v-if="authPending" class="cp-state">Loading template designer…</div>

  <div v-else-if="!canRead" class="cp-state">You do not have permission to view invoice templates.</div>

  <div v-else-if="listPending && !listData" class="cp-state">Loading template designer…</div>

  <div v-else-if="listError" class="cp-state">{{ loadErrorMessage }}</div>

  <div v-else-if="!selectedTemplateId" class="cp-state">
    No invoice templates found. Redeploy or seed the default template, then refresh.
  </div>

  <div v-else-if="pending && !data" class="cp-state">Loading template designer…</div>

  <div v-else-if="error || !template" class="cp-state">{{ loadErrorMessage }}</div>

  <div v-else>
    <div class="card" style="margin-bottom:16px;">
      <div class="chead">
        <div>
          <h3>
            Template Designer
            <span class="pill indigo" style="vertical-align:3px">{{ template.name }}</span>
            <span v-if="template.isDefault" class="pill ok" style="vertical-align:3px;margin-left:6px;">Default</span>
          </h3>
          <p style="margin:6px 0 0;font-size:13px;color:#64748b;">
            Choose the system invoice template, then open the Blade editor to edit layout and preview live.
          </p>
        </div>
        <div class="right" style="display:flex;flex-wrap:wrap;gap:8px;">
          <button
            v-if="canManage"
            type="button"
            class="btn"
            :disabled="duplicateBusy"
            @click="duplicateTemplate"
          >
            {{ duplicateBusy ? 'Duplicating…' : 'Duplicate template' }}
          </button>
          <button
            v-if="canManage && !template.isDefault"
            type="button"
            class="btn"
            @click="setDefaultTemplate"
          >
            Set as system default
          </button>
          <button
            type="button"
            class="btn primary"
            @click="openEditor"
          >
            Open template editor
          </button>
        </div>
      </div>

      <div class="cbody" style="padding:16px;">
        <label class="fld" style="max-width:420px;">
          System template
          <select
            class="fld"
            aria-label="System template"
            :value="selectedTemplateId ?? ''"
            @change="onTemplateChange"
          >
            <option
              v-for="t in listData?.items ?? []"
              :key="t.id"
              :value="t.id"
            >
              {{ templateOptionLabel(t.name, t.isDefault, t.latestVersion?.status) }}
            </option>
          </select>
        </label>

        <dl class="kv" style="margin:16px 0 0;">
          <dt>Version</dt><dd>{{ versionMeta }}</dd>
          <dt>Used by</dt><dd>{{ usageCount }} invoice{{ usageCount === 1 ? '' : 's' }}</dd>
          <dt>Engine</dt><dd>Laravel Blade</dd>
          <dt>Status</dt><dd>{{ statusText }}</dd>
        </dl>
      </div>
    </div>

    <p v-if="publishError" class="help" style="color:#dc2626; margin:-8px 0 8px;">{{ publishError }}</p>
    <p v-if="actionError" class="help" style="color:#dc2626; margin:-8px 0 8px;">{{ actionError }}</p>
    <p v-if="actionMessage" class="help" style="color:#059669; margin:-8px 0 8px;">{{ actionMessage }}</p>

    <div v-if="editorOpen" class="modal-scrim open" @click.self="closeEditor">
      <div class="card modal-card td-editor-modal">
        <div class="chead">
          <div>
            <h3>Blade template editor</h3>
            <p style="margin:4px 0 0;font-size:12px;color:#64748b;">
              {{ template.name }} · {{ previewInvoiceLabel }} · previews refresh as you type
            </p>
          </div>
          <div class="right" style="display:flex;flex-wrap:wrap;gap:8px;">
            <button type="button" class="btn ghost sm" :disabled="!dirty" @click="resetBlade">Reset</button>
            <button
              v-if="canManage"
              type="button"
              class="btn primary sm"
              :disabled="publishBusy || !dirty || !bladeSource.trim()"
              @click="publishTemplate"
            >
              {{ publishBusy ? 'Saving…' : 'Save & publish' }}
            </button>
            <button type="button" class="btn sm" @click="closeEditor">Close</button>
          </div>
        </div>

        <div class="td-editor-body">
          <div class="td-panel">
            <div class="td-snippets">
              <button
                v-for="snip in BLADE_SNIPPETS"
                :key="snip.label"
                type="button"
                :disabled="!canManage"
                @click="insertSnippet(snip.insert)"
              >
                {{ snip.label }}
              </button>
            </div>
            <textarea
              v-model="bladeSource"
              class="td-code"
              spellcheck="false"
              :readonly="!canManage"
              aria-label="Blade template source"
            />
            <div class="td-status" :class="{ dirty }">{{ statusText }}</div>
          </div>

          <div class="td-panel">
            <div class="td-preview-tabs" role="tablist" aria-label="Template previews">
              <button
                type="button"
                role="tab"
                :aria-selected="previewTab === 'pdf'"
                :class="{ on: previewTab === 'pdf' }"
                @click="previewTab = 'pdf'"
              >
                PDF
              </button>
              <button
                type="button"
                role="tab"
                :aria-selected="previewTab === 'html'"
                :class="{ on: previewTab === 'html' }"
                @click="previewTab = 'html'"
              >
                HTML
              </button>
              <span class="td-preview-meta">
                {{ previewBusy ? 'Rendering…' : 'Live' }}
              </span>
            </div>

            <div class="td-pdf-wrap">
              <p v-if="previewError" class="td-preview-error">{{ previewError }}</p>
              <p v-else-if="previewBusy && !previewUrl && !previewHtml" class="td-preview-empty">
                Rendering preview…
              </p>
              <template v-else-if="previewTab === 'pdf'">
                <ClientOnly v-if="previewUrl">
                  <PdfViewer
                    :src="previewUrl"
                    title="Invoice template PDF preview"
                    :show-download="false"
                  />
                </ClientOnly>
                <p v-else class="td-preview-empty">PDF preview will appear here.</p>
              </template>
              <iframe
                v-else-if="previewHtml"
                class="td-html-frame"
                title="Invoice template HTML preview"
                :srcdoc="previewHtml"
              />
              <p v-else class="td-preview-empty">HTML preview will appear here.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn.sm { font-size:12px; padding:6px 10px; }
.td-editor-modal {
  width: min(1280px, 98vw);
  max-height: 94vh;
  display: flex;
  flex-direction: column;
}
.td-editor-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.td-editor-body .td-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e2e8f0;
}
.td-editor-body .td-panel:last-child {
  border-right: none;
}
.td-preview-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.td-preview-tabs button {
  appearance: none;
  border: 1px solid #e2e8f0;
  background: #fff;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  color: #64748b;
  cursor: pointer;
}
.td-preview-tabs button.on {
  color: #4f46e5;
  border-color: #c7d2fe;
  background: #eef2ff;
}
.td-preview-meta {
  margin-left: auto;
  font-size: 11px;
  color: #94a3b8;
}
.td-pdf-wrap {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-height: 520px;
  padding: 12px;
  flex: 1;
  overflow: auto;
}
.td-pdf-wrap :deep(.pdf-viewer) {
  flex: 1;
  min-height: 480px;
}
.td-html-frame {
  width: 100%;
  min-height: 520px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}
.td-preview-empty,
.td-preview-error {
  margin: auto;
  max-width: 360px;
  text-align: center;
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
}
.td-preview-error { color: #dc2626; }
@media (max-width: 960px) {
  .td-editor-body {
    grid-template-columns: 1fr;
  }
  .td-editor-body .td-panel {
    border-right: none;
    border-bottom: 1px solid #e2e8f0;
    max-height: 48vh;
  }
}
</style>
