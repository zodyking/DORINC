<script setup lang="ts">
import {
  designSettingsFromForm,
  detectFontPreset,
  logoPreviewUrl,
  publishStatusLabel,
  sectionsFromSettings,
  TEMPLATE_FONT_OPTIONS,
  TEMPLATE_PAGE_SIZE_OPTIONS,
  TEMPLATE_SECTION_DEFS,
  templateOptionLabel,
  versionStatusLabel,
  type InvoiceTemplateDesignSettings,
  type InvoiceTemplateSectionKey,
  type TemplateFontPreset,
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

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const authPending = computed(() => !auth.loaded)
const canRead = computed(() => auth.loaded && auth.can('templates.read.all'))
const canManage = computed(() => auth.loaded && auth.can('templates.manage.all'))

const selectedTemplateId = ref<string | null>(null)
const savedSettings = ref<InvoiceTemplateDesignSettings | null>(null)

const form = reactive({
  pageSize: 'Letter' as 'Letter' | 'A4',
  marginInches: 0.5,
  accentColor: '#2563eb',
  accentColor2: '#1e293b',
  fontPreset: 'system' as TemplateFontPreset,
  logoFileId: null as string | null,
  sections: sectionsFromSettings() as Record<InvoiceTemplateSectionKey, { visible: boolean, label: string }>,
})

const publishBusy = ref(false)
const publishError = ref('')
const actionError = ref('')
const actionMessage = ref('')
const testPdfBusy = ref(false)
const duplicateBusy = ref(false)
const logoUploadBusy = ref(false)

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

const currentDesignSettings = computed(() => designSettingsFromForm(form))

const dirty = computed(() => {
  if (!savedSettings.value) return false
  return JSON.stringify(currentDesignSettings.value) !== JSON.stringify(savedSettings.value)
})

const logoUrl = computed(() => logoPreviewUrl(form.logoFileId))

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

function loadSettingsFromVersion(settings: InvoiceTemplateDesignSettings) {
  form.pageSize = settings.pageSize
  form.marginInches = settings.marginInches
  form.accentColor = settings.accentColor
  form.accentColor2 = settings.accentColor2
  form.fontPreset = detectFontPreset(settings)
  form.logoFileId = settings.logoFileId ?? null
  form.sections = sectionsFromSettings(settings)
  savedSettings.value = designSettingsFromForm(form)
}

watch(activeVersion, (v) => {
  if (!v) return
  loadSettingsFromVersion(v.designSettings)
}, { immediate: true })

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

function resetSettings() {
  if (!activeVersion.value) return
  if (dirty.value && !confirm('Reset all changes to the last loaded version?')) return
  loadSettingsFromVersion(activeVersion.value.designSettings)
}

async function onTemplateChange(ev: Event) {
  const id = (ev.target as HTMLSelectElement).value
  if (dirty.value && !confirm('You have unsaved changes. Switch template anyway?')) {
    return
  }
  selectedTemplateId.value = id
}

async function refreshPreview() {
  if (!canRead.value || !template.value) return
  previewBusy.value = true
  previewError.value = ''
  try {
    const blob = await $fetch<Blob>(`/api/invoice-templates/${template.value.id}/preview-pdf`, {
      method: 'POST',
      body: { designSettings: currentDesignSettings.value },
      responseType: 'blob',
    })
    if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = URL.createObjectURL(blob)
  }
  catch (e: unknown) {
    previewError.value = await fetchErrorMessage(e, 'Preview failed — check PDF service')
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
  if (!canManage.value || !template.value) return
  publishBusy.value = true
  publishError.value = ''
  try {
    await $fetch(`/api/invoice-templates/${template.value.id}/publish`, {
      method: 'POST',
      body: { designSettings: currentDesignSettings.value },
    })
    savedSettings.value = currentDesignSettings.value
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
      { method: 'POST', body: { designSettings: currentDesignSettings.value } },
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

async function onLogoPick(ev: Event) {
  if (!canManage.value || !template.value) return
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  logoUploadBusy.value = true
  actionError.value = ''
  try {
    const body = new FormData()
    body.append('file', file)
    body.append('ownerEntityType', 'template')
    body.append('ownerEntityId', template.value.id)
    body.append('fileKind', 'attachment')
    const res = await $fetch<{ file: { id: string } }>('/api/files', { method: 'POST', body })
    form.logoFileId = res.file.id
  }
  catch (e: unknown) {
    actionError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Logo upload failed'
  }
  finally {
    logoUploadBusy.value = false
  }
}

function clearLogo() {
  form.logoFileId = null
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
            Customize the Laravel Blade invoice layout — colors, fonts, sections, and page setup.
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
              <span class="badge">Blade</span>
            </div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn ghost sm" :disabled="!dirty" @click="resetSettings">Reset</button>
            </div>
          </div>

          <div class="td-settings">
            <label class="fld">
              Page size
              <select v-model="form.pageSize" class="fld" :disabled="!canManage">
                <option v-for="opt in TEMPLATE_PAGE_SIZE_OPTIONS" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </label>

            <label class="fld">
              Margins (inches)
              <input
                v-model.number="form.marginInches"
                type="number"
                min="0.25"
                max="1.5"
                step="0.05"
                :disabled="!canManage"
              >
            </label>

            <label class="fld">
              Font family
              <select v-model="form.fontPreset" class="fld" :disabled="!canManage">
                <option v-for="opt in TEMPLATE_FONT_OPTIONS" :key="opt.key" :value="opt.key">
                  {{ opt.label }}
                </option>
              </select>
            </label>

            <div class="fld">
              <span>Accent colors</span>
              <div class="td-color-row">
                <input v-model="form.accentColor" type="color" :disabled="!canManage" aria-label="Primary accent">
                <input v-model="form.accentColor" type="text" maxlength="7" :disabled="!canManage">
              </div>
              <div class="td-color-row">
                <input v-model="form.accentColor2" type="color" :disabled="!canManage" aria-label="Secondary accent">
                <input v-model="form.accentColor2" type="text" maxlength="7" :disabled="!canManage">
              </div>
            </div>

            <div class="fld">
              <span>Logo</span>
              <div class="td-logo-block">
                <div class="td-logo-preview" :style="{ '--pv-accent': form.accentColor }">
                  <img v-if="logoUrl" :src="logoUrl" alt="Logo preview">
                  <span v-else>DOR<br>INC</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  <label v-if="canManage" class="btn sm" style="cursor:pointer;">
                    {{ logoUploadBusy ? 'Uploading…' : 'Upload logo' }}
                    <input type="file" accept="image/*" hidden :disabled="logoUploadBusy" @change="onLogoPick">
                  </label>
                  <button v-if="canManage && form.logoFileId" type="button" class="btn ghost sm" @click="clearLogo">
                    Remove logo
                  </button>
                </div>
              </div>
            </div>

            <fieldset class="fld" style="border:none; padding:0; margin:12px 0 0;">
              <legend style="font-size:12px; font-weight:600; color:#475569; margin-bottom:8px;">Sections</legend>
              <div
                v-for="section in TEMPLATE_SECTION_DEFS"
                :key="section.key"
                style="display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;"
              >
                <label style="display:flex; align-items:center; gap:6px; min-width:180px;">
                  <input
                    v-model="form.sections[section.key].visible"
                    type="checkbox"
                    :disabled="!canManage || section.required"
                  >
                  <span style="font-size:13px;">{{ section.label }}</span>
                </label>
                <input
                  v-model="form.sections[section.key].label"
                  type="text"
                  class="fld"
                  style="flex:1; min-width:140px; margin:0;"
                  :placeholder="section.label"
                  :disabled="!canManage"
                >
              </div>
            </fieldset>
          </div>

          <div class="td-status" :class="{ dirty }">{{ statusText }}</div>
        </div>
      </div>

      <div class="td-panel">
        <div class="card">
          <div class="td-preview-head">
            <div>
              <strong style="font-size:13px;">PDF preview</strong>
              <span>Laravel Blade + DomPDF · {{ previewInvoiceLabel }}</span>
            </div>
            <button
              type="button"
              class="btn sm"
              :disabled="previewBusy"
              @click="refreshPreview"
            >
              {{ previewBusy ? 'Rendering…' : 'Refresh preview' }}
            </button>
          </div>

          <div class="td-pdf-wrap">
            <p v-if="previewError" class="td-preview-error">{{ previewError }}</p>
            <p v-else-if="!previewUrl && !previewBusy" class="td-preview-empty">
              Click <strong>Refresh preview</strong> to render the current template settings as PDF.
            </p>
            <ClientOnly v-else-if="previewUrl">
              <PdfViewer
                :src="previewUrl"
                title="Invoice template PDF preview"
                :show-download="false"
              />
            </ClientOnly>
          </div>

          <dl class="kv" style="margin:0; border-top:1px solid #f1f5f9;">
            <dt>Version</dt><dd>{{ versionMeta }}</dd>
            <dt>Used by</dt><dd>{{ usageCount }} invoice{{ usageCount === 1 ? '' : 's' }}</dd>
            <dt>Engine</dt><dd>Laravel Blade (invoices/pdf)</dd>
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
.td-pdf-wrap :deep(.pdf-viewer) {
  flex:1;
  min-height:480px;
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
