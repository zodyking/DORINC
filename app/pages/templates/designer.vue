<script setup lang="ts">
// Advanced invoice template designer (P3-05) — sections, multi-template, test PDF, real preview.
import {
  DEFAULT_INVOICE_TEMPLATE_DESIGN,
  designSettingsFromForm,
  detectFontPreset,
  logoPreviewUrl,
  previewSampleFromInvoice,
  previewStyleVars,
  publishStatusLabel,
  sectionLabel,
  sectionVisible,
  sectionsFromSettings,
  TEMPLATE_FONT_OPTIONS,
  TEMPLATE_PAGE_SIZE_OPTIONS,
  TEMPLATE_PREVIEW_SAMPLE,
  TEMPLATE_SECTION_DEFS,
  templateOptionLabel,
  type InvoiceTemplateSectionKey,
  type PreviewInvoiceApiRow,
  type TemplateFontPreset,
  versionStatusLabel,
} from '~/utils/invoice-template-designer-ui'

definePageMeta({ layout: 'staff' })

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
  designSettings: typeof DEFAULT_INVOICE_TEMPLATE_DESIGN
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

const canRead = computed(() => auth.can('templates.read.all'))
const canManage = computed(() => auth.can('templates.manage.all'))
const canUpload = computed(() => auth.can('files.upload.all'))

const selectedTemplateId = ref<string | null>(null)
const useRealPreview = ref(true)

const { data: listData, refresh: refreshList } = await useFetch<{ items: TemplateListItem[] }>(
  '/api/invoice-templates',
)

const { data: previewInvoiceData } = await useFetch<{ preview: PreviewInvoiceApiRow | null }>(
  '/api/invoice-templates/preview-invoice',
  { immediate: canRead.value },
)

const { data, refresh, pending, error } = await useFetch<TemplateDetailResponse>(
  () => (selectedTemplateId.value
    ? `/api/invoice-templates/${selectedTemplateId.value}`
    : '/api/invoice-templates'),
  {
    query: computed(() => (selectedTemplateId.value ? {} : { default: 'true' })),
    watch: [selectedTemplateId],
  },
)

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
    await router.replace({ query: { ...route.query, template: id } })
  }
})

const template = computed(() => data.value?.template ?? null)
const activeVersion = computed(() => data.value?.publishedVersion ?? data.value?.latestVersion ?? null)
const usageCount = computed(() => data.value?.usageCount ?? 0)

const form = reactive({
  pageSize: DEFAULT_INVOICE_TEMPLATE_DESIGN.pageSize,
  marginInches: DEFAULT_INVOICE_TEMPLATE_DESIGN.marginInches,
  accentColor: DEFAULT_INVOICE_TEMPLATE_DESIGN.accentColor,
  accentColor2: DEFAULT_INVOICE_TEMPLATE_DESIGN.accentColor2,
  fontPreset: 'system' as TemplateFontPreset,
  logoFileId: null as string | null,
  sections: sectionsFromSettings(),
})

const savedSnapshot = ref('')
const dirty = ref(false)
const publishBusy = ref(false)
const publishError = ref('')
const actionError = ref('')
const actionMessage = ref('')
const logoBusy = ref(false)
const logoError = ref('')
const logoInput = ref<HTMLInputElement | null>(null)
const testPdfBusy = ref(false)
const duplicateBusy = ref(false)

function snapshotForm() {
  return JSON.stringify({
    pageSize: form.pageSize,
    marginInches: form.marginInches,
    accentColor: form.accentColor,
    accentColor2: form.accentColor2,
    fontPreset: form.fontPreset,
    logoFileId: form.logoFileId,
    sections: form.sections,
  })
}

function loadVersionIntoForm(v: TemplateVersionRow) {
  const s = v.designSettings
  form.pageSize = s.pageSize
  form.marginInches = s.marginInches
  form.accentColor = s.accentColor
  form.accentColor2 = s.accentColor2
  form.fontPreset = detectFontPreset(s)
  form.logoFileId = s.logoFileId ?? null
  form.sections = sectionsFromSettings(s)
  savedSnapshot.value = snapshotForm()
  dirty.value = false
}

watch(activeVersion, (v) => {
  if (!v) return
  loadVersionIntoForm(v)
}, { immediate: true })

watch(form, () => {
  dirty.value = snapshotForm() !== savedSnapshot.value
}, { deep: true })

const previewVars = computed(() => previewStyleVars({
  accentColor: form.accentColor,
  fontSans: TEMPLATE_FONT_OPTIONS.find(o => o.key === form.fontPreset)?.fontSans
    ?? DEFAULT_INVOICE_TEMPLATE_DESIGN.fontSans,
}))

const logoUrl = computed(() => logoPreviewUrl(form.logoFileId))

const statusText = computed(() => {
  const v = activeVersion.value
  if (!v) return 'Loading template…'
  if (dirty.value) return 'Unsaved changes · preview only'
  return publishStatusLabel(v.publishedAt, v.versionNumber, usageCount.value)
})

const versionMeta = computed(() => {
  const v = activeVersion.value
  if (!v) return '—'
  return versionStatusLabel(v.status, v.versionNumber)
})

const previewSample = computed(() => {
  if (useRealPreview.value && previewInvoiceData.value?.preview) {
    return previewSampleFromInvoice(previewInvoiceData.value.preview)
  }
  return TEMPLATE_PREVIEW_SAMPLE
})

function isSectionVisible(key: InvoiceTemplateSectionKey) {
  return sectionVisible(form.sections, key)
}

function sectionHeading(key: InvoiceTemplateSectionKey) {
  return sectionLabel(form.sections, key)
}

async function onTemplateChange(ev: Event) {
  const id = (ev.target as HTMLSelectElement).value
  if (dirty.value && !confirm('You have unsaved changes. Switch template anyway?')) {
    return
  }
  selectedTemplateId.value = id
}

function resetForm() {
  if (!activeVersion.value) return
  if (dirty.value && !confirm('Reset all changes to the last loaded version?')) return
  loadVersionIntoForm(activeVersion.value)
}

function openLogoPicker() {
  if (!canManage.value || !canUpload.value) return
  logoInput.value?.click()
}

async function onLogoSelected(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !template.value) return

  if (!file.type.startsWith('image/')) {
    logoError.value = 'Logo must be a PNG or JPEG image'
    return
  }

  logoBusy.value = true
  logoError.value = ''
  try {
    const body = new FormData()
    body.append('file', file, file.name)
    body.append('ownerEntityType', 'template')
    body.append('ownerEntityId', template.value.id)
    body.append('fileKind', 'attachment')
    const { file: uploaded } = await $fetch<{ file: { id: string } }>('/api/files', {
      method: 'POST',
      body,
    })
    form.logoFileId = uploaded.id
  }
  catch (e: unknown) {
    logoError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Logo upload failed'
  }
  finally {
    logoBusy.value = false
  }
}

function clearLogo() {
  form.logoFileId = null
}

async function publishTemplate() {
  if (!canManage.value || !template.value) return
  publishBusy.value = true
  publishError.value = ''
  try {
    await $fetch(`/api/invoice-templates/${template.value.id}/publish`, {
      method: 'POST',
      body: { designSettings: designSettingsFromForm(form) },
    })
    savedSnapshot.value = snapshotForm()
    dirty.value = false
    await refresh()
    await refreshList()
    actionMessage.value = 'Template published'
  }
  catch (e: unknown) {
    publishError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Publish failed'
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
    const { job } = await $fetch<{ job: { id: string, outputFileId: string | null } }>(
      `/api/invoice-templates/${template.value.id}/test-pdf`,
      { method: 'POST', body: { designSettings: designSettingsFromForm(form) } },
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
</script>

<template>
  <section v-if="!canRead" class="page active">
    <div class="empty">You do not have permission to view invoice templates.</div>
  </section>

  <section v-else-if="pending && !data" class="page active">
    <div class="empty">Loading template designer…</div>
  </section>

  <section v-else-if="error || !template" class="page active">
    <div class="empty">Could not load the invoice template.</div>
  </section>

  <section v-else class="page active">
    <div class="pagehead">
      <div>
        <h2>
          Template Designer
          <span class="pill indigo" style="vertical-align:3px">{{ template.name }}</span>
          <span v-if="template.isDefault" class="pill ok" style="vertical-align:3px;margin-left:6px;">Default</span>
        </h2>
        <p>Logo, colors, fonts, page layout, section visibility — preview with sample or live invoice data. Publish creates an immutable version.</p>
      </div>
      <div class="actions">
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
          {{ publishBusy ? 'Publishing…' : 'Publish template' }}
        </button>
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
              <button type="button" class="btn ghost sm" :disabled="!dirty" @click="resetForm">Reset</button>
            </div>
          </div>

          <div class="td-settings">
            <div class="td-logo-block">
              <div class="td-logo-preview" :style="{ background: form.accentColor }">
                <img v-if="logoUrl" :src="logoUrl" alt="Logo preview">
                <span v-else>DOR<br>INC</span>
              </div>
              <div>
                <button
                  type="button"
                  class="btn sm"
                  :disabled="!canManage || !canUpload || logoBusy"
                  @click="openLogoPicker"
                >
                  {{ logoBusy ? 'Uploading…' : 'Upload logo' }}
                </button>
                <button
                  v-if="form.logoFileId && canManage"
                  type="button"
                  class="btn sm ghost"
                  style="margin-left:6px;"
                  @click="clearLogo"
                >
                  Remove
                </button>
                <input ref="logoInput" type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onLogoSelected">
              </div>
            </div>

            <label class="fld">
              Accent color
              <div class="td-color-row">
                <input v-model="form.accentColor" type="color" :disabled="!canManage">
                <input v-model="form.accentColor" type="text" maxlength="7" :disabled="!canManage">
              </div>
            </label>

            <label class="fld">
              Secondary accent
              <div class="td-color-row">
                <input v-model="form.accentColor2" type="color" :disabled="!canManage">
                <input v-model="form.accentColor2" type="text" maxlength="7" :disabled="!canManage">
              </div>
            </label>

            <label class="fld">
              Font
              <select v-model="form.fontPreset" :disabled="!canManage">
                <option v-for="opt in TEMPLATE_FONT_OPTIONS" :key="opt.key" :value="opt.key">{{ opt.label }}</option>
              </select>
            </label>

            <label class="fld">
              Page size
              <select v-model="form.pageSize" :disabled="!canManage">
                <option v-for="opt in TEMPLATE_PAGE_SIZE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>

            <label class="fld">
              Margins (inches)
              <input v-model.number="form.marginInches" type="number" min="0.25" max="1.5" step="0.05" :disabled="!canManage">
            </label>

            <div class="fld" style="margin-top:8px;">
              <strong style="font-size:13px;">Sections</strong>
              <span class="help">Toggle visibility and customize headings (line items and totals always shown).</span>
              <div class="td-sections">
                <label
                  v-for="def in TEMPLATE_SECTION_DEFS"
                  :key="def.key"
                  class="td-section-row"
                >
                  <input
                    v-model="form.sections[def.key].visible"
                    type="checkbox"
                    :disabled="!canManage || def.required"
                  >
                  <input
                    v-model="form.sections[def.key].label"
                    type="text"
                    class="fld"
                    style="margin:0;"
                    :disabled="!canManage"
                  >
                </label>
              </div>
            </div>
          </div>
          <div class="td-status" :class="{ dirty }">{{ statusText }}</div>
        </div>
      </div>

      <div class="td-panel">
        <div class="card">
          <div class="td-preview-head">
            <div>
              <strong style="font-size:13px;">Live preview</strong>
              <span>Sample invoice {{ previewSample.invoiceNumber }} · reflects design settings</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <label class="help" style="display:flex;align-items:center;gap:6px;margin:0;">
                <input v-model="useRealPreview" type="checkbox" :disabled="!previewInvoiceData?.preview">
                Real invoice data
              </label>
            </div>
          </div>
          <div class="pvwrap">
            <div class="pv" :style="previewVars">
              <div v-if="isSectionVisible('company_info') || isSectionVisible('invoice_meta')" class="pvtop">
                <div v-if="isSectionVisible('company_info')">
                  <h4>{{ previewSample.businessName }}</h4>
                  <div class="tag">{{ previewSample.tagline }}</div>
                </div>
                <div v-if="isSectionVisible('invoice_meta')" class="pvno">
                  <div class="t">Invoice</div>
                  <div class="n">{{ previewSample.invoiceNumber }}</div>
                  <div style="color:#888; font-size:10px; margin-top:3px;">
                    Issued {{ previewSample.issued }} · Due {{ previewSample.due }}
                  </div>
                </div>
              </div>
              <div v-if="isSectionVisible('customer') || isSectionVisible('vehicle')" class="pvmeta">
                <div v-if="isSectionVisible('customer')">
                  <div class="k">{{ sectionHeading('customer') }}</div>
                  <div class="v">{{ previewSample.customer }}</div>
                </div>
                <div v-if="isSectionVisible('vehicle')">
                  <div class="k">{{ sectionHeading('vehicle') }}</div>
                  <div class="v">{{ previewSample.vehicle }}</div>
                </div>
                <div v-if="isSectionVisible('vehicle')">
                  <div class="k">VIN</div>
                  <div class="v mono" style="font-size:10px;">{{ previewSample.vin }}</div>
                </div>
                <div v-if="isSectionVisible('vehicle')">
                  <div class="k">Odometer</div>
                  <div class="v">{{ previewSample.odometer }}</div>
                </div>
              </div>
              <table v-if="isSectionVisible('line_items')">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th class="r">Qty</th>
                    <th class="r">Rate</th>
                    <th class="r">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(line, i) in previewSample.lines" :key="i">
                    <td>
                      {{ line.description }}
                      <span v-if="line.sub" class="s">{{ line.sub }}</span>
                    </td>
                    <td class="r">{{ line.qty }}</td>
                    <td class="r">{{ line.rate }}</td>
                    <td class="r">{{ line.amount }}</td>
                  </tr>
                </tbody>
              </table>
              <div v-if="isSectionVisible('totals')" class="pvsums">
                <div class="r"><span>Subtotal</span><span>{{ previewSample.subtotal }}</span></div>
                <div v-for="adj in previewSample.adjustments" :key="adj.label" class="r">
                  <span>{{ adj.label }}</span><span>{{ adj.value }}</span>
                </div>
                <div class="r g"><span>Balance due</span><span>{{ previewSample.balanceDue }}</span></div>
              </div>
              <div v-if="isSectionVisible('symptoms')" class="pvnotes">
                <b>{{ sectionHeading('symptoms') }}</b>
                {{ previewSample.workNotes }}
              </div>
              <div v-if="isSectionVisible('payment') || isSectionVisible('terms')" class="pvterms">
                <b v-if="isSectionVisible('payment')">{{ sectionHeading('payment') }}</b>
                <template v-if="isSectionVisible('terms')">{{ previewSample.paymentTerms }}</template>
              </div>
              <div v-if="isSectionVisible('footer')" class="pvfoot" style="white-space:pre-line;">{{ previewSample.footer }}</div>
            </div>
          </div>
          <dl class="kv" style="margin:0; border-top:1px solid #f1f5f9;">
            <dt>Version</dt><dd>{{ versionMeta }}</dd>
            <dt>Used by</dt><dd>{{ usageCount }} invoice{{ usageCount === 1 ? '' : 's' }}</dd>
            <dt>Paper</dt><dd>{{ form.pageSize }} · {{ form.marginInches }}in margins</dd>
          </dl>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.td-sections { display:flex; flex-direction:column; gap:6px; margin-top:8px; }
.td-section-row { display:grid; grid-template-columns:auto 1fr; gap:8px; align-items:center; }
.btn.sm { font-size:12px; padding:6px 10px; }
</style>
