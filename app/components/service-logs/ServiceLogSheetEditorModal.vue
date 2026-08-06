<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { formatSheetPriceDisplay } from '~/utils/service-log-sheet-display'
import type { ServiceLogSheetDocument } from '#shared/service-log-sheet-default'
import type { SheetCatalogPick } from '~/composables/useServiceLogSheetEditor'
import ServiceLogSheetLines from '~/components/service-logs/ServiceLogSheetLines.vue'

interface SheetBusiness {
  businessName: string
  phone: string
  email: string
  addressLine: string
}

interface SheetPayload {
  document: ServiceLogSheetDocument
  business: SheetBusiness
  catalogItems: SheetCatalogPick[]
}

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const api = useServiceLogSheetEditor()

const pending = ref(false)
const saving = ref(false)
const error = ref('')
const business = ref<SheetBusiness | null>(null)
const catalogItems = ref<SheetCatalogPick[]>([])
const catalogQ = ref('')
const catalogTargetSectionId = ref<string | null>(null)
const showCatalogPicker = ref(false)

type ViewMode = 'paper' | 'lines'
/** Lines is the editor; Paper is the real Letter PDF preview. */
const view = ref<ViewMode>('lines')
const viewTouched = ref(false)
const compact = ref(false)
const paperPreviewUrl = ref('')
const paperPreviewBusy = ref(false)

const filteredCatalog = computed(() => {
  const term = catalogQ.value.trim().toLowerCase()
  const list = catalogItems.value
  if (!term) return list.slice(0, 100)
  return list.filter((item) => {
    const hay = [item.name, item.description ?? '', item.categoryName ?? '', item.itemType]
      .join(' ')
      .toLowerCase()
    return hay.includes(term)
  }).slice(0, 100)
})

const sections = computed(() => api.doc?.sections ?? [])
const lineCount = computed(() => api.lineCount)
const pageFill = computed(() => api.pageFill)

function revokePaperPreview() {
  if (paperPreviewUrl.value) {
    URL.revokeObjectURL(paperPreviewUrl.value)
    paperPreviewUrl.value = ''
  }
}

async function refreshPaperPreview() {
  const document = api.cleanDocument() ?? api.doc
  if (!document) return
  paperPreviewBusy.value = true
  error.value = ''
  try {
    const blob = await $fetch<Blob>('/api/service-logs/sheet/preview-pdf', {
      method: 'POST',
      body: document,
      responseType: 'blob',
    })
    revokePaperPreview()
    paperPreviewUrl.value = URL.createObjectURL(blob)
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not render Letter preview')
  }
  finally {
    paperPreviewBusy.value = false
  }
}

function measureViewport() {
  if (typeof window === 'undefined') return
  compact.value = window.innerWidth < 1024
  if (!viewTouched.value) view.value = 'lines'
}

function setView(next: ViewMode) {
  view.value = next
  viewTouched.value = true
  if (next === 'paper') void refreshPaperPreview()
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const data = await $fetch<SheetPayload>('/api/service-logs/sheet')
    api.setDocument(data.document)
    business.value = data.business
    catalogItems.value = data.catalogItems
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not load service log sheet')
  }
  finally {
    pending.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    catalogQ.value = ''
    showCatalogPicker.value = false
    catalogTargetSectionId.value = null
    viewTouched.value = false
    view.value = 'lines'
    measureViewport()
    void load()
  }
  else {
    revokePaperPreview()
  }
}, { immediate: true })

onMounted(() => {
  window.addEventListener('resize', measureViewport)
  measureViewport()
})

onUnmounted(() => {
  window.removeEventListener('resize', measureViewport)
  revokePaperPreview()
})

function close() {
  open.value = false
  error.value = ''
  revokePaperPreview()
}

function openCatalogPicker(sectionId?: string | null) {
  catalogTargetSectionId.value = sectionId
    || api.selectedSectionId
    || api.leftSections[0]?.id
    || api.rightSections[0]?.id
    || null
  catalogQ.value = ''
  showCatalogPicker.value = true
}

function addCatalogItem(pick: SheetCatalogPick) {
  if (api.addCatalogItem(pick, catalogTargetSectionId.value)) {
    showCatalogPicker.value = false
  }
}

async function resetDefault() {
  if (!window.confirm('Reset to the default Letter service log sheet template?')) return
  saving.value = true
  error.value = ''
  try {
    const res = await $fetch<{ document: ServiceLogSheetDocument }>('/api/service-logs/sheet/reset', {
      method: 'POST',
    })
    api.setDocument(res.document)
    if (view.value === 'paper') void refreshPaperPreview()
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not reset sheet')
  }
  finally {
    saving.value = false
  }
}

async function save() {
  const cleaned = api.cleanDocument()
  if (!cleaned) return
  saving.value = true
  error.value = ''
  try {
    await $fetch('/api/service-logs/sheet', { method: 'PUT', body: cleaned })
    emit('saved')
    close()
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not save service log sheet')
  }
  finally {
    saving.value = false
  }
}

function onScrimClick(event: MouseEvent) {
  if ((event.target as HTMLElement).id === 'sl-sheet-scrim') close()
}
</script>

<template>
  <div
    id="sl-sheet-scrim"
    class="modal-scrim sl-editor-scrim"
    :class="{ open }"
    :aria-hidden="!open"
    @click="onScrimClick"
  >
    <div
      class="sl-editor"
      role="dialog"
      aria-labelledby="sl-sheet-title"
      aria-modal="true"
      @click.stop
    >
      <header class="sl-bar">
        <div class="sl-bar-text">
          <h3 id="sl-sheet-title">Edit Template</h3>
          <p>
            {{ view === 'paper'
              ? 'Exact Letter PDF preview of the current template'
              : 'Edit every printed line, then check the layout in Paper view' }}
          </p>
        </div>

        <div class="sl-bar-actions">
          <div class="sl-seg" role="group" aria-label="Editor view">
            <button
              type="button"
              class="sl-seg-btn"
              :class="{ active: view === 'lines' }"
              :aria-pressed="view === 'lines'"
              @click="setView('lines')"
            >Lines</button>
            <button
              type="button"
              class="sl-seg-btn"
              :class="{ active: view === 'paper' }"
              :aria-pressed="view === 'paper'"
              @click="setView('paper')"
            >Paper</button>
          </div>

          <button
            type="button"
            class="btn sm sl-hide-compact"
            :disabled="saving || pending"
            @click="api.addSection('left')"
          >
            + Left section
          </button>
          <button
            type="button"
            class="btn sm sl-hide-compact"
            :disabled="saving || pending"
            @click="api.addSection('right')"
          >
            + Right section
          </button>
          <button
            type="button"
            class="btn sm sl-hide-compact"
            :disabled="saving || pending || !sections.length"
            @click="openCatalogPicker()"
          >
            + From catalog
          </button>
          <button type="button" class="btn sm" :disabled="saving || pending" @click="resetDefault">
            Reset template
          </button>
          <button type="button" class="btn sm sl-hide-compact" :disabled="saving" @click="close">Cancel</button>
          <button
            type="button"
            class="btn primary sm sl-hide-compact"
            :disabled="saving || pending || !api.doc"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save sheet' }}
          </button>
          <button type="button" class="sl-close" aria-label="Close editor" @click="close">✕</button>
        </div>
      </header>

      <p v-if="error" class="sl-error" role="alert">{{ error }}</p>

      <p
        v-if="!error && pageFill.overflows"
        class="sl-warn"
        role="status"
      >
        This catalog is taller than the front page ({{ pageFill.rows }} of
        {{ pageFill.capacity }} lines in the longest column). It still prints — the
        extra lines continue on a second page with the column headers repeated.
      </p>

      <p v-if="pending" class="sl-status">Loading Letter sheet…</p>

      <div
        v-else-if="api.doc"
        class="sl-body"
        :class="{ 'has-catalog': showCatalogPicker && view === 'lines' }"
      >
        <!-- Lines: editable sections (explicit import — do not rely on auto-import here) -->
        <div v-show="view === 'lines'" class="sl-stage sl-stage-lines">
          <ServiceLogSheetLines :api="api" @catalog="openCatalogPicker" />
        </div>

        <!-- Paper: real DomPDF Letter output so preview always matches print -->
        <div v-show="view === 'paper'" class="sl-stage sl-stage-paper">
          <p v-if="paperPreviewBusy" class="sl-status sl-status-on-paper">Rendering Letter preview…</p>
          <iframe
            v-else-if="paperPreviewUrl"
            class="sl-pdf"
            title="Service log sheet Letter preview"
            :src="paperPreviewUrl"
          />
          <p v-else class="sl-status sl-status-on-paper">Switch to Paper again to refresh the preview.</p>
        </div>

        <aside v-if="showCatalogPicker && view === 'lines'" class="sl-catalog" aria-label="Add from catalog">
          <div class="sl-catalog-head">
            <h4>Add from catalog</h4>
            <button type="button" class="btn sm" @click="showCatalogPicker = false">Close</button>
          </div>
          <label class="fld sl-catalog-search">
            <span class="sl-sr">Search catalog</span>
            <input v-model="catalogQ" type="search" placeholder="Search catalog…">
          </label>
          <ul v-if="filteredCatalog.length" class="sl-catalog-list">
            <li v-for="pick in filteredCatalog" :key="pick.id">
              <button type="button" class="sl-catalog-row" @click="addCatalogItem(pick)">
                <span>
                  <strong>{{ pick.name }}</strong>
                  <small v-if="pick.categoryName">{{ pick.categoryName }}</small>
                </span>
                <span>{{ formatSheetPriceDisplay(pick.defaultPrice) }}</span>
              </button>
            </li>
          </ul>
          <p v-else class="help">No catalog matches.</p>
        </aside>
      </div>

      <p v-else-if="!pending" class="sl-status">
        No sheet loaded yet.
      </p>

      <footer v-if="compact" class="sl-foot">
        <span class="sl-foot-count">{{ lineCount }} lines</span>
        <button type="button" class="btn" :disabled="saving" @click="close">Cancel</button>
        <button
          type="button"
          class="btn primary"
          :disabled="saving || pending || !api.doc"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save sheet' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.sl-editor-scrim {
  align-items: stretch;
  padding: 0;
  background: rgba(15, 23, 42, 0.55);
}
.sl-editor {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100dvh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  background: #eef2f7;
  overflow: hidden;
}
.sl-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px solid #dbe2ea;
  flex: none;
}
.sl-bar-text h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
}
.sl-bar-text p {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 11.5px;
  max-width: 60ch;
}
.sl-bar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.sl-seg {
  display: inline-flex;
  padding: 2px;
  border: 1px solid #d7dee7;
  border-radius: 9px;
  background: #f7f9fc;
}
.sl-seg-btn {
  min-height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #475569;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.sl-seg-btn.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
}
.sl-close {
  appearance: none;
  width: 34px;
  height: 34px;
  border: 1px solid #e2e8f0;
  border-radius: 9px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
}
.sl-close:hover { background: #e2e8f0; color: #0f172a; }
.sl-error,
.sl-warn,
.sl-status {
  margin: 10px 12px 0;
  padding: 9px 12px;
  border-radius: 9px;
  font-size: 12.5px;
  flex: none;
}
.sl-error { background: #fef2f2; color: #dc2626; }
.sl-warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.sl-status { color: #64748b; }
.sl-status-on-paper {
  margin: 24px auto;
  max-width: 36ch;
  text-align: center;
  color: #e5e7eb;
  background: transparent;
}
.sl-body {
  flex: 1 1 auto;
  min-height: 50vh;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
  position: relative;
  overflow: hidden;
}
.sl-body.has-catalog { grid-template-columns: 1fr 320px; }
.sl-stage {
  min-height: 0;
  min-width: 0;
  height: 100%;
  overflow: auto;
  background: #eef2f7;
}
.sl-stage-lines {
  padding: 0;
}
.sl-stage-paper {
  padding: 0;
  background: #525659;
}
.sl-pdf {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 70vh;
  border: 0;
  background: #525659;
}
.sl-catalog {
  border-left: 1px solid #dbe2ea;
  background: #fff;
  padding: 12px;
  overflow: auto;
}
.sl-catalog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.sl-catalog-head h4 {
  margin: 0;
  font-size: 13px;
}
.sl-catalog-search { margin: 0 0 8px; }
.sl-catalog-search input { min-height: 40px; }
.sl-catalog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}
.sl-catalog-row {
  width: 100%;
  min-height: 46px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 12.5px;
}
.sl-catalog-row:hover { background: #f8fafc; }
.sl-catalog-row strong { display: block; }
.sl-catalog-row small { color: #94a3b8; }
.sl-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fff;
  border-top: 1px solid #dbe2ea;
  padding-bottom: max(10px, env(safe-area-inset-bottom));
  flex: none;
}
.sl-foot-count {
  flex: 1;
  color: #64748b;
  font-size: 12px;
}
.sl-foot .btn { min-height: 44px; flex: none; }
.sl-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
@media (max-width: 1023px) {
  .sl-hide-compact { display: none; }
  .sl-bar { padding: 8px 10px; }
  .sl-bar-text p { display: none; }
  .sl-body.has-catalog { grid-template-columns: 1fr; }
  .sl-catalog {
    position: absolute;
    inset: auto 0 0 0;
    max-height: 60%;
    border-left: 0;
    border-top: 1px solid #dbe2ea;
    box-shadow: 0 -12px 30px -20px rgba(15, 23, 42, 0.5);
  }
}
</style>
