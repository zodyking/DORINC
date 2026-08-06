<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { formatSheetPriceDisplay } from '~/utils/service-log-sheet-display'
import {
  SERVICE_LOG_SHEET_DOCUMENT_CSS,
  SERVICE_LOG_SHEET_EDITOR_CHROME_CSS,
} from '#shared/service-log-sheet-styles'
import type { ServiceLogSheetDocument } from '#shared/service-log-sheet-default'
import type { SheetCatalogPick } from '~/composables/useServiceLogSheetEditor'

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
const view = ref<ViewMode>('paper')
const viewTouched = ref(false)
const compact = ref(false)

const stageRef = ref<HTMLElement | null>(null)
const zoom = ref<number | 'fit'>('fit')
const fitScale = ref(1)
const scale = computed(() => (zoom.value === 'fit' ? fitScale.value : zoom.value))
const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`)

const PAGE_WIDTH_PX = 8.5 * 96
const CATALOG_PANEL_PX = 320
const STYLE_ID = 'sl-sheet-paper-css'

/**
 * Editor-only chrome on top of the shared document CSS. The document CSS is the
 * byte-identical stylesheet DomPDF gets, so the paper stays a faithful replica;
 * everything here is limited to editing affordances (inputs, tools, selection).
 */
const EDITOR_CSS = `
.sl-paper .sheet-input {
  width: 100%;
  min-width: 0;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  border-radius: 2px;
  box-shadow: none;
}
.sl-paper .sheet-input:focus {
  outline: 1.5px solid #6366f1;
  background: #fff;
}
.sl-paper .sl-title-line {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sl-paper .sl-title-input {
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.sl-paper .sl-price-input { text-align: right; }
.sl-paper .service-name { position: relative; }
.sl-paper .service-name.is-selected,
.sl-paper .price-cell.is-selected { background: #eef2ff; }
.sl-paper .category-title.is-selected { background: #e0e7ff; }
.sl-paper .sl-tools {
  display: none;
  gap: 2px;
  white-space: nowrap;
}
.sl-paper .sl-tools-row {
  position: absolute;
  z-index: 2;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
}
.sl-paper .category-title:hover .sl-tools,
.sl-paper .category-title.is-selected .sl-tools,
.sl-paper tr:hover .sl-tools-row,
.sl-paper .service-name.is-selected .sl-tools-row { display: inline-flex; }
.sl-paper .sl-tool {
  appearance: none;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border: 1px solid #cbd5e1;
  border-radius: 3px;
  background: #fff;
  color: #334155;
  font-size: 9px;
  line-height: 1;
  cursor: pointer;
}
.sl-paper .sl-tool:hover { background: #eef2ff; border-color: #a5b4fc; }
.sl-paper .sl-tool.is-danger { color: #dc2626; border-color: #fecaca; }
`

function mountSheetStyles() {
  if (typeof document === 'undefined') return
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = [
    SERVICE_LOG_SHEET_DOCUMENT_CSS,
    SERVICE_LOG_SHEET_EDITOR_CHROME_CSS,
    EDITOR_CSS,
  ].join('\n')
}

function unmountSheetStyles() {
  if (typeof document === 'undefined') return
  document.getElementById(STYLE_ID)?.remove()
}

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

function measureViewport() {
  if (typeof window === 'undefined') return
  const nowCompact = window.innerWidth < 1024
  compact.value = nowCompact
  // Follow the viewport until the user picks a view themselves.
  if (!viewTouched.value) view.value = nowCompact ? 'lines' : 'paper'

  // Measured from the viewport rather than the stage: the paper is wider than
  // the stage at high zoom, which would keep a stage measurement pinned.
  const panel = showCatalogPicker.value && !nowCompact ? CATALOG_PANEL_PX : 0
  const available = Math.max(280, window.innerWidth - panel - 48)
  // Cap the upscale: 7.4pt print type is only readable a little above 100%.
  fitScale.value = Math.min(1.3, available / PAGE_WIDTH_PX)
}

watch(showCatalogPicker, () => void nextTick(measureViewport))

function setView(next: ViewMode) {
  view.value = next
  viewTouched.value = true
  void nextTick(measureViewport)
}

function zoomBy(step: number) {
  const next = Math.min(2, Math.max(0.4, Math.round((scale.value + step) * 20) / 20))
  zoom.value = next
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const data = await $fetch<SheetPayload>('/api/service-logs/sheet')
    api.setDocument(data.document)
    business.value = data.business
    catalogItems.value = data.catalogItems
    await nextTick()
    measureViewport()
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not load service log sheet')
  }
  finally {
    pending.value = false
  }
}

// immediate so the sheet also loads when the modal mounts already open.
watch(open, (isOpen) => {
  if (isOpen) {
    mountSheetStyles()
    catalogQ.value = ''
    showCatalogPicker.value = false
    catalogTargetSectionId.value = null
    viewTouched.value = false
    zoom.value = 'fit'
    void load()
  }
  else {
    unmountSheetStyles()
  }
}, { immediate: true })

onMounted(() => {
  window.addEventListener('resize', measureViewport)
  measureViewport()
})

onUnmounted(() => {
  window.removeEventListener('resize', measureViewport)
  stageObserver?.disconnect()
  unmountSheetStyles()
})

function close() {
  open.value = false
  error.value = ''
}

function openCatalogPicker(sectionId?: string | null) {
  catalogTargetSectionId.value = sectionId
    || api.selectedSectionId.value
    || api.leftSections.value[0]?.id
    || api.rightSections.value[0]?.id
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
          <h3 id="sl-sheet-title">Edit Service Log Sheet</h3>
          <p>
            {{ view === 'paper'
              ? 'Exactly the Letter print layout — click any title, line or price to edit'
              : 'Edit every printed line, then check the layout in Paper view' }}
          </p>
        </div>

        <div class="sl-bar-actions">
          <div class="sl-seg" role="group" aria-label="Editor view">
            <button
              type="button"
              class="sl-seg-btn"
              :class="{ active: view === 'paper' }"
              :aria-pressed="view === 'paper'"
              @click="setView('paper')"
            >Paper</button>
            <button
              type="button"
              class="sl-seg-btn"
              :class="{ active: view === 'lines' }"
              :aria-pressed="view === 'lines'"
              @click="setView('lines')"
            >Lines</button>
          </div>

          <div v-if="view === 'paper'" class="sl-seg sl-zoom" role="group" aria-label="Zoom">
            <button type="button" class="sl-seg-btn" aria-label="Zoom out" @click="zoomBy(-0.1)">−</button>
            <button type="button" class="sl-seg-btn" :class="{ active: zoom === 'fit' }" @click="zoom = 'fit'">
              {{ zoom === 'fit' ? `Fit ${zoomLabel}` : zoomLabel }}
            </button>
            <button type="button" class="sl-seg-btn" aria-label="Zoom in" @click="zoomBy(0.1)">+</button>
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
            :disabled="saving || pending || !api.sections.value.length"
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
            :disabled="saving || pending || !api.doc.value"
            @click="save"
          >
            {{ saving ? 'Saving…' : 'Save sheet' }}
          </button>
          <button type="button" class="sl-close" aria-label="Close editor" @click="close">✕</button>
        </div>
      </header>

      <p v-if="error" class="sl-error" role="alert">{{ error }}</p>

      <p
        v-else-if="api.pageFill.value.overflows"
        class="sl-warn"
        role="status"
      >
        This catalog is taller than the front page ({{ api.pageFill.value.rows }} of
        {{ api.pageFill.value.capacity }} lines in the longest column). It still prints — the
        extra lines continue on a second page with the column headers repeated.
      </p>

      <p v-if="pending" class="sl-status">Loading Letter sheet…</p>

      <div v-else-if="api.doc.value && business" class="sl-body" :class="{ 'has-catalog': showCatalogPicker }">
        <div v-if="view === 'paper'" ref="stageRef" class="sl-stage">
          <!-- zoom (not transform) keeps layout, scrollbars and hit testing correct -->
          <div class="sl-paper sheet-doc" :style="{ zoom: scale }">
            <ServiceLogSheetPaper
              :api="api"
              :business="business"
              @catalog="openCatalogPicker"
            />
          </div>
        </div>

        <div v-else class="sl-stage sl-stage-lines">
          <ServiceLogSheetLines :api="api" @catalog="openCatalogPicker" />
        </div>

        <aside v-if="showCatalogPicker" class="sl-catalog" aria-label="Add from catalog">
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

      <footer v-if="compact" class="sl-foot">
        <span class="sl-foot-count">{{ api.lineCount.value }} lines</span>
        <button type="button" class="btn" :disabled="saving" @click="close">Cancel</button>
        <button
          type="button"
          class="btn primary"
          :disabled="saving || pending || !api.doc.value"
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
.sl-zoom .sl-seg-btn { min-width: 34px; }
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
}
.sl-error { background: #fef2f2; color: #dc2626; }
.sl-warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.sl-status { color: #64748b; }
.sl-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  position: relative;
}
.sl-body.has-catalog { grid-template-columns: 1fr 320px; }
.sl-stage {
  min-height: 0;
  /* 1fr grid columns default to a content-based minimum: without this the paper
     keeps the stage wide when the catalog panel opens, so fit never recomputes. */
  min-width: 0;
  overflow: auto;
  padding: 16px;
  display: flex;
  align-items: flex-start;
}
/* margin auto, not justify-content: centred flex items clip their overflow. */
.sl-stage > .sl-paper { margin: 0 auto; }
.sl-stage-lines {
  padding: 0;
  background: #eef2f7;
}
.sl-paper { flex: none; }
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
