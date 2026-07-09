<script setup lang="ts">
import {
  publishStatusLabel,
  templateOptionLabel,
  versionStatusLabel,
  type InvoiceTemplateDesignSettings,
} from '~/utils/invoice-template-designer-ui'

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
  htmlContent: string
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

const TD_SNIPPETS = [
  { label: 'company_info', snippet: ' data-section="company_info"' },
  { label: 'invoice_meta', snippet: ' data-section="invoice_meta"' },
  { label: 'customer', snippet: ' data-section="customer"' },
  { label: 'vehicle', snippet: ' data-section="vehicle"' },
  { label: 'line_items', snippet: ' data-section="line_items"' },
  { label: 'totals', snippet: ' data-section="totals"' },
  { label: 'footer', snippet: ' data-section="footer"' },
  { label: '--accent', snippet: 'var(--accent)' },
  { label: 'line row', snippet: `<tr>
  <td><div class="desc">Description</div></td>
  <td class="center"><span class="type-badge">L</span></td>
  <td class="center mono">1</td>
  <td class="num mono">$0.00</td>
  <td class="num mono">$0.00</td>
</tr>` },
] as const

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const authPending = computed(() => !auth.loaded)
const canRead = computed(() => auth.loaded && auth.can('templates.read.all'))
const canManage = computed(() => auth.loaded && auth.can('templates.manage.all'))

const selectedTemplateId = ref<string | null>(null)
const sourceCode = ref('')
const savedSource = ref('')
const dirty = ref(false)
const codeEditor = ref<HTMLTextAreaElement | null>(null)

const publishBusy = ref(false)
const publishError = ref('')
const actionError = ref('')
const actionMessage = ref('')
const testPdfBusy = ref(false)
const duplicateBusy = ref(false)

const previewBusy = ref(false)
const previewError = ref('')
const previewUrl = ref('')
const previewInvoiceLabel = ref('sample invoice')

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

function loadSourceFromVersion(v: TemplateVersionRow) {
  sourceCode.value = v.htmlContent
  savedSource.value = v.htmlContent
  dirty.value = false
}

watch(activeVersion, (v) => {
  if (!v) return
  loadSourceFromVersion(v)
}, { immediate: true })

watch(sourceCode, () => {
  dirty.value = sourceCode.value !== savedSource.value
})

const statusText = computed(() => {
  const v = activeVersion.value
  if (!v) return 'Loading template…'
  if (dirty.value) return 'Unsaved changes — refresh preview to validate'
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

function insertSnippet(snippet: string) {
  const el = codeEditor.value
  if (!el || !canManage.value) return
  const start = el.selectionStart
  const end = el.selectionEnd
  const val = sourceCode.value
  sourceCode.value = val.slice(0, start) + snippet + val.slice(end)
  nextTick(() => {
    el.selectionStart = el.selectionEnd = start + snippet.length
    el.focus()
  })
}

function formatSource() {
  sourceCode.value = sourceCode.value
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'
}

function resetSource() {
  if (!activeVersion.value) return
  if (dirty.value && !confirm('Reset all changes to the last loaded version?')) return
  loadSourceFromVersion(activeVersion.value)
}

async function onTemplateChange(ev: Event) {
  const id = (ev.target as HTMLSelectElement).value
  if (dirty.value && !confirm('You have unsaved changes. Switch template anyway?')) {
    return
  }
  selectedTemplateId.value = id
}

async function refreshPreview() {
  if (!canRead.value || !template.value || !sourceCode.value.trim()) return
  previewBusy.value = true
  previewError.value = ''
  try {
    const blob = await $fetch<Blob>(`/api/invoice-templates/${template.value.id}/preview-pdf`, {
      method: 'POST',
      body: { htmlContent: sourceCode.value },
      responseType: 'blob',
    })
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
  }
  catch (e: unknown) {
    previewError.value = (e as { data?: { message?: string } })?.data?.message
      ?? (e as Error)?.message
      ?? 'Preview failed — check template HTML and PDF service'
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = ''
    }
  }
  finally {
    previewBusy.value = false
  }
}

async function publishTemplate() {
  if (!canManage.value || !template.value || !activeVersion.value) return
  publishBusy.value = true
  publishError.value = ''
  try {
    await $fetch(`/api/invoice-templates/${template.value.id}/publish`, {
      method: 'POST',
      body: {
        htmlContent: sourceCode.value,
        designSettings: activeVersion.value.designSettings,
      },
    })
    savedSource.value = sourceCode.value
    dirty.value = false
    await refresh()
    await refreshList()
    actionMessage.value = 'Template saved and published'
    await refreshPreview()
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
    await $fetch(`/api/invoice-templates/${template.value.id}`, {
      method: 'PATCH',
      body: { isDefault: true },
    })
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
    await $fetch<{ job: { id: string } }>(
      `/api/invoice-templates/${template.value.id}/test-pdf`,
      { method: 'POST', body: { htmlContent: sourceCode.value } },
    )
    actionMessage.value = 'Test PDF queued — it will appear in your downloads shortly.'
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Test render failed'
  }
  finally {
    testPdfBusy.value = false
  }
}

onUnmounted(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
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
            Edit the full HTML layout — paste code, insert snippets, preview as PDF, and save.
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
            v-if="canManage"
            type="button"
            class="btn"
            :disabled="testPdfBusy"
            @click="testRenderPdf"
          >
            {{ testPdfBusy ? 'Queuing…' : 'Test render PDF' }}
          </button>
          <button
            v-if="canManage && !template.isDefault"
            type="button"
            class="btn"
            @click="setDefaultTemplate"
          >
            Set default
          </button>
          <button
            v-if="canManage"
            type="button"
            class="btn primary"
            :disabled="publishBusy || !dirty"
            @click="publishTemplate"
          >
            {{ publishBusy ? 'Saving…' : 'Save template' }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="publishError" class="help" style="color:#dc2626; margin:-8px 0 8px;">{{ publishError }}</p>
    <p v-if="actionError" class="help" style="color:#dc2626; margin:-8px 0 8px;">{{ actionError }}</p>
    <p v-if="actionMessage" class="help" style="color:#059669; margin:-8px 0 8px;">{{ actionMessage }}</p>

    <div class="td-layout">
      <div class="td-panel">
        <div class="card">
          <div class="td-toolbar">
            <div class="left">
              <label style="font-size:12px; font-weight:600; color:#475569;">Template</label>
              <select
                class="fld"
                style="width:auto; min-width:200px; margin:0;"
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
              <span class="badge">HTML</span>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn ghost sm" :disabled="!canManage" @click="formatSource">Format</button>
              <button type="button" class="btn ghost sm" :disabled="!dirty" @click="resetSource">Reset</button>
            </div>
          </div>

          <div class="td-snippets" aria-label="Insert HTML snippets">
            <button
              v-for="item in TD_SNIPPETS"
              :key="item.label"
              type="button"
              :disabled="!canManage"
              @click="insertSnippet(item.snippet)"
            >
              {{ item.label }}
            </button>
          </div>

          <div class="cbody">
            <textarea
              ref="codeEditor"
              v-model="sourceCode"
              class="td-code"
              spellcheck="false"
              aria-label="Invoice template HTML source"
              :readonly="!canManage"
            />
          </div>
          <div class="td-status" :class="{ dirty }">{{ statusText }}</div>
        </div>
      </div>

      <div class="td-panel">
        <div class="card">
          <div class="td-preview-head">
            <div>
              <strong style="font-size:13px;">PDF preview</strong>
              <span>Renders via DomPDF · {{ previewInvoiceLabel }}</span>
            </div>
            <button
              type="button"
              class="btn sm"
              :disabled="previewBusy || !sourceCode.trim()"
              @click="refreshPreview"
            >
              {{ previewBusy ? 'Rendering…' : 'Refresh preview' }}
            </button>
          </div>

          <div class="pvwrap td-pdf-wrap">
            <p v-if="previewError" class="td-preview-error">{{ previewError }}</p>
            <p v-else-if="!previewUrl && !previewBusy" class="td-preview-empty">
              Click <strong>Refresh preview</strong> to render the current HTML as PDF.
            </p>
            <iframe
              v-if="previewUrl"
              :src="previewUrl"
              class="td-pdf-frame"
              title="Invoice template PDF preview"
            />
          </div>

          <dl class="kv" style="margin:0; border-top:1px solid #f1f5f9;">
            <dt>Version</dt><dd>{{ versionMeta }}</dd>
            <dt>Used by</dt><dd>{{ usageCount }} invoice{{ usageCount === 1 ? '' : 's' }}</dd>
            <dt>Engine</dt><dd>Laravel DomPDF</dd>
          </dl>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn.sm { font-size:12px; padding:6px 10px; }
.td-pdf-wrap {
  display:flex;
  flex-direction:column;
  align-items:stretch;
  min-height:520px;
  padding:12px;
}
.td-pdf-frame {
  flex:1;
  width:100%;
  min-height:480px;
  border:none;
  border-radius:8px;
  background:#fff;
  box-shadow:0 8px 32px -8px rgba(15,23,42,.25);
}
.td-preview-empty,
.td-preview-error {
  margin:auto;
  max-width:360px;
  text-align:center;
  font-size:13px;
  color:#64748b;
  line-height:1.5;
}
.td-preview-error { color:#dc2626; }
</style>
