<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { formatSheetPriceDisplay } from '~/utils/service-log-sheet-display'
import {
  SERVICE_LOG_SHEET_CSS,
  SERVICE_LOG_SHEET_PAGE_MARGIN_IN,
} from '#shared/service-log-sheet-styles'
import type {
  ServiceLogSheetDocument,
  ServiceLogSheetLine,
  ServiceLogSheetSection,
} from '#shared/service-log-sheet-default'

interface CatalogPick {
  id: string
  name: string
  description: string | null
  defaultPrice: string | null
  itemType: string
  categoryName: string | null
}

interface SheetBusiness {
  businessName: string
  phone: string
  email: string
  addressLine: string
}

interface SheetPayload {
  document: ServiceLogSheetDocument
  business: SheetBusiness
  catalogItems: CatalogPick[]
}

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const pending = ref(false)
const saving = ref(false)
const error = ref('')
const sheetDoc = ref<ServiceLogSheetDocument | null>(null)
const business = ref<SheetBusiness | null>(null)
const catalogItems = ref<CatalogPick[]>([])
const catalogQ = ref('')
const catalogTargetSectionId = ref<string | null>(null)
const showCatalogPicker = ref(false)
const selectedSectionId = ref<string | null>(null)
const selectedItemId = ref<string | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const scale = ref(1)
const STYLE_ID = 'sl-sheet-wysiwyg-css'
const EDIT_CSS = `
.sl-wysiwyg-stack {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
}
.sl-paper-edit.page {
  width: 8.5in !important;
  height: 11in !important;
  max-height: 11in !important;
  padding: ${SERVICE_LOG_SHEET_PAGE_MARGIN_IN}in !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  background: #fff !important;
  box-shadow: 0 18px 50px -20px rgba(15, 23, 42, 0.45);
}
.sl-paper-edit .category { position: relative; }
.sl-paper-edit .category.is-selected { outline: 2px solid #6366f1; outline-offset: 1px; }
.sl-paper-edit .service-table tr.is-selected td { background: #eef2ff; }
.sl-paper-edit .sheet-input {
  width: 100%; border: 0; background: transparent; font: inherit; color: inherit;
  padding: 0; margin: 0; box-shadow: none; border-radius: 0;
}
.sl-paper-edit .sheet-input:focus { outline: 1px solid #6366f1; background: #fff; }
.sl-paper-edit .category-title .sheet-input {
  font-size: 6.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; line-height: 8px;
}
.sl-paper-edit .service-name .sheet-input { font-size: 6.4px; font-weight: 600; line-height: 8px; }
.sl-paper-edit .service-subtext .sheet-input { font-size: 5.5px; font-weight: 400; color: #6b7280; line-height: 7px; }
.sl-paper-edit .printed-price .sheet-input { width: 100%; text-align: center; font-size: 5.8px; font-weight: 700; }
.sl-paper-edit .sec-tools, .sl-paper-edit .row-tools { display: none; gap: 2px; position: absolute; z-index: 2; }
.sl-paper-edit .category.is-selected .sec-tools,
.sl-paper-edit .category:hover .sec-tools { display: flex; top: -18px; right: 0; }
.sl-paper-edit .service-table tr.is-selected .row-tools,
.sl-paper-edit .service-table tr:hover .row-tools { display: flex; }
.sl-paper-edit .row-tools { position: static; justify-content: flex-end; white-space: nowrap; }
.sl-paper-edit .mini {
  appearance: none; border: 1px solid #cbd5e1; background: #fff; color: #334155;
  border-radius: 4px; font-size: 9px; line-height: 1; padding: 2px 4px; cursor: pointer;
}
.sl-paper-edit .mini.danger { color: #dc2626; border-color: #fecaca; }
`

function mountSheetStyles() {
  if (typeof document === 'undefined') return
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = `${SERVICE_LOG_SHEET_CSS}\n${EDIT_CSS}`
}

function unmountSheetStyles() {
  if (typeof document === 'undefined') return
  document.getElementById(STYLE_ID)?.remove()
}

const leftSections = computed(() =>
  (sheetDoc.value?.sections ?? []).filter(s => s.column === 'left'),
)
const rightSections = computed(() =>
  (sheetDoc.value?.sections ?? []).filter(s => s.column === 'right'),
)

const companyDetailsHtml = computed(() => {
  if (!business.value) return ''
  const line2 = [business.value.phone, business.value.email].filter(Boolean).join(' · ')
  return [business.value.addressLine, line2].filter(Boolean).join('\n')
})

const filteredCatalog = computed(() => {
  const term = catalogQ.value.trim().toLowerCase()
  const list = catalogItems.value
  if (!term) return list.slice(0, 100)
  return list.filter((item) => {
    const hay = [item.name, item.description ?? '', item.categoryName ?? '', item.itemType].join(' ').toLowerCase()
    return hay.includes(term)
  }).slice(0, 100)
})

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Date.now().toString(36)}`
}

const blankWorkRows = Array.from({ length: 24 }, (_, i) => i)

function updateScale() {
  const stage = stageRef.value
  if (!stage) return
  const pad = 32
  const availW = Math.max(280, stage.clientWidth - pad)
  // Scale to fit width primarily; user can scroll for the second page.
  const pageW = 8.5 * 96
  scale.value = Math.min(1, availW / pageW)
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const data = await $fetch<SheetPayload>('/api/service-logs/sheet')
    sheetDoc.value = structuredClone(data.document)
    business.value = data.business
    catalogItems.value = data.catalogItems
    await nextTick()
    updateScale()
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
    mountSheetStyles()
    catalogQ.value = ''
    showCatalogPicker.value = false
    catalogTargetSectionId.value = null
    selectedSectionId.value = null
    selectedItemId.value = null
    void load()
  }
  else {
    unmountSheetStyles()
  }
})

onMounted(() => {
  window.addEventListener('resize', updateScale)
})
onUnmounted(() => {
  window.removeEventListener('resize', updateScale)
  unmountSheetStyles()
})

function close() {
  open.value = false
  error.value = ''
}

function findSection(sectionId: string): ServiceLogSheetSection | undefined {
  return sheetDoc.value?.sections.find(s => s.id === sectionId)
}

function selectSection(sectionId: string) {
  selectedSectionId.value = sectionId
  selectedItemId.value = null
}

function selectItem(sectionId: string, itemId: string) {
  selectedSectionId.value = sectionId
  selectedItemId.value = itemId
}

function addSection(column: 'left' | 'right') {
  if (!sheetDoc.value) return
  const section: ServiceLogSheetSection = {
    id: newId('sec'),
    title: 'New section',
    column,
    items: [{
      id: newId('item'),
      name: 'New service',
      subtext: '',
      price: '$0',
      catalogItemId: null,
    }],
  }
  sheetDoc.value.sections.push(section)
  selectedSectionId.value = section.id
}

function removeSection(sectionId: string) {
  if (!sheetDoc.value) return
  const section = findSection(sectionId)
  if (!section) return
  if (!window.confirm(`Remove section "${section.title}"?`)) return
  sheetDoc.value.sections = sheetDoc.value.sections.filter(s => s.id !== sectionId)
  if (selectedSectionId.value === sectionId) selectedSectionId.value = null
}

function moveSection(sectionId: string, direction: -1 | 1) {
  if (!sheetDoc.value) return
  const section = findSection(sectionId)
  if (!section) return
  const same = sheetDoc.value.sections.filter(s => s.column === section.column)
  const idx = same.findIndex(s => s.id === sectionId)
  const swapWith = same[idx + direction]
  if (!swapWith) return
  const all = sheetDoc.value.sections
  const a = all.findIndex(s => s.id === sectionId)
  const b = all.findIndex(s => s.id === swapWith.id)
  const tmp = all[a]!
  all[a] = all[b]!
  all[b] = tmp
}

function moveSectionColumn(sectionId: string) {
  const section = findSection(sectionId)
  if (!section) return
  section.column = section.column === 'left' ? 'right' : 'left'
}

function addBlankItem(sectionId: string) {
  const section = findSection(sectionId)
  if (!section) return
  const item: ServiceLogSheetLine = {
    id: newId('item'),
    name: 'New service',
    subtext: '',
    price: '$0',
    catalogItemId: null,
  }
  section.items.push(item)
  selectedItemId.value = item.id
}

function removeItem(sectionId: string, itemId: string) {
  const section = findSection(sectionId)
  if (!section) return
  section.items = section.items.filter(i => i.id !== itemId)
  if (selectedItemId.value === itemId) selectedItemId.value = null
}

function moveItem(sectionId: string, itemId: string, direction: -1 | 1) {
  const section = findSection(sectionId)
  if (!section) return
  const idx = section.items.findIndex(i => i.id === itemId)
  const next = idx + direction
  if (idx < 0 || next < 0 || next >= section.items.length) return
  const tmp = section.items[idx]!
  section.items[idx] = section.items[next]!
  section.items[next] = tmp
}

function openCatalogPicker(sectionId?: string | null) {
  catalogTargetSectionId.value = sectionId
    || selectedSectionId.value
    || leftSections.value[0]?.id
    || rightSections.value[0]?.id
    || null
  catalogQ.value = ''
  showCatalogPicker.value = true
}

function addCatalogItem(pick: CatalogPick) {
  let sectionId = catalogTargetSectionId.value
  if (!sectionId || !findSection(sectionId)) {
    addSection('left')
    sectionId = selectedSectionId.value
  }
  if (!sectionId) return
  const section = findSection(sectionId)
  if (!section) return
  const line: ServiceLogSheetLine = {
    id: newId('item'),
    name: pick.name,
    subtext: pick.description?.trim() || '',
    price: formatSheetPriceDisplay(pick.defaultPrice) === '—'
      ? '$0'
      : (formatSheetPriceDisplay(pick.defaultPrice) || '$0'),
    catalogItemId: pick.id,
  }
  section.items.push(line)
  selectedSectionId.value = sectionId
  selectedItemId.value = line.id
  showCatalogPicker.value = false
}

async function resetDefault() {
  if (!window.confirm('Reset to the default Letter service catalog template?')) return
  saving.value = true
  error.value = ''
  try {
    const res = await $fetch<{ document: ServiceLogSheetDocument }>('/api/service-logs/sheet/reset', {
      method: 'POST',
    })
    sheetDoc.value = structuredClone(res.document)
    selectedSectionId.value = null
    selectedItemId.value = null
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not reset sheet')
  }
  finally {
    saving.value = false
  }
}

async function save() {
  if (!sheetDoc.value) return
  saving.value = true
  error.value = ''
  try {
    const cleaned: ServiceLogSheetDocument = {
      version: 2,
      sections: sheetDoc.value.sections.map(section => ({
        ...section,
        title: section.title.trim() || 'Untitled',
        items: section.items
          .filter(item => item.name.trim())
          .map(item => ({
            ...item,
            name: item.name.trim(),
            subtext: item.subtext?.trim() || '',
            price: item.price?.trim() || '',
            catalogItemId: item.catalogItemId ?? null,
          })),
      })),
    }
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

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'sl-sheet-scrim') close()
}
</script>

<template>
  <div
    id="sl-sheet-scrim"
    class="modal-scrim sl-wysiwyg-scrim"
    :class="{ open }"
    :aria-hidden="!open"
    @click="onScrimClick"
  >
    <div
      class="sl-wysiwyg"
      role="dialog"
      aria-labelledby="sl-sheet-title"
      aria-modal="true"
      @click.stop
    >
      <header class="sl-wysiwyg-bar">
        <div class="sl-wysiwyg-bar-text">
          <h3 id="sl-sheet-title">Edit Service Log Sheet</h3>
          <p>What you see is the Letter print layout — click a section or line to edit</p>
        </div>
        <div class="sl-wysiwyg-bar-actions">
          <button type="button" class="btn sm" :disabled="saving || pending" @click="addSection('left')">+ Left section</button>
          <button type="button" class="btn sm" :disabled="saving || pending" @click="addSection('right')">+ Right section</button>
          <button type="button" class="btn sm" :disabled="saving || pending || !sheetDoc?.sections.length" @click="openCatalogPicker()">
            + From catalog
          </button>
          <button type="button" class="btn sm" :disabled="saving || pending" @click="resetDefault">Reset template</button>
          <button type="button" class="btn" :disabled="saving" @click="close">Cancel</button>
          <button type="button" class="btn primary" :disabled="saving || pending || !sheetDoc" @click="save">
            {{ saving ? 'Saving…' : 'Save sheet' }}
          </button>
          <button type="button" class="close" aria-label="Close" @click="close">✕</button>
        </div>
      </header>

      <p v-if="error" class="err">{{ error }}</p>
      <p v-else-if="pending" class="help sl-wysiwyg-status">Loading Letter sheet…</p>

      <div v-else-if="sheetDoc && business" class="sl-wysiwyg-body">
        <div ref="stageRef" class="sl-wysiwyg-stage">
          <div class="sl-wysiwyg-scale" :style="{ transform: `scale(${scale})` }">
            <div class="sl-wysiwyg-stack">
            <main class="page page-front sl-paper-edit" aria-label="Service log sheet front">
              <table class="header">
                <tr>
                  <td>
                    <h2 class="company-name">{{ business.businessName }}</h2>
                    <div class="company-details" style="white-space: pre-line;">{{ companyDetailsHtml }}</div>
                  </td>
                  <td class="document-title">
                    <h1>Service Log Sheet</h1>
                    <p>Blank field log and work authorization</p>
                  </td>
                </tr>
              </table>

              <table class="top-fields">
                <tr>
                  <td style="width:38%">
                    <span class="field-label">Customer Name</span>
                    <div class="field-box" />
                  </td>
                  <td style="width:18%">
                    <span class="field-label">Invoice Date</span>
                    <div class="field-box" />
                  </td>
                  <td style="width:18%">
                    <span class="field-label">Due Date</span>
                    <div class="field-box" />
                  </td>
                  <td style="width:26%">
                    <span class="field-label">Bus or Unit Number</span>
                    <div class="field-box" />
                  </td>
                </tr>
              </table>

              <section class="complaint-field">
                <span class="field-label">Customer Complaint or Vehicle Symptoms</span>
                <div class="complaint-box" />
              </section>

              <table class="catalog-grid">
                <tr>
                  <td>
                    <section
                      v-for="(section, sIdx) in leftSections"
                      :key="section.id"
                      class="category"
                      :class="{ 'is-selected': selectedSectionId === section.id }"
                      @click="selectSection(section.id)"
                    >
                      <div class="sec-tools">
                        <button type="button" class="mini" title="Move up" @click.stop="moveSection(section.id, -1)">↑</button>
                        <button type="button" class="mini" title="Move down" @click.stop="moveSection(section.id, 1)">↓</button>
                        <button type="button" class="mini" title="Move to right" @click.stop="moveSectionColumn(section.id)">→</button>
                        <button type="button" class="mini" title="Add line" @click.stop="addBlankItem(section.id)">+</button>
                        <button type="button" class="mini" title="From catalog" @click.stop="openCatalogPicker(section.id)">☰</button>
                        <button type="button" class="mini danger" title="Remove section" @click.stop="removeSection(section.id)">✕</button>
                      </div>
                      <div class="category-title">
                        <input v-model="section.title" class="sheet-input" type="text" maxlength="120" aria-label="Section title">
                      </div>
                      <table class="service-table">
                        <colgroup>
                          <col class="check-column">
                          <col>
                          <col class="price-column">
                        </colgroup>
                        <thead v-if="sIdx === 0">
                          <tr>
                            <th />
                            <th>Service</th>
                            <th>Price / New Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="item in section.items"
                            :key="item.id"
                            :class="{ 'is-selected': selectedItemId === item.id }"
                            @click.stop="selectItem(section.id, item.id)"
                          >
                            <td class="check-cell"><span class="checkbox" /></td>
                            <td class="service-name">
                              <input v-model="item.name" class="sheet-input" type="text" maxlength="200" aria-label="Service name">
                              <span class="service-subtext">
                                <input v-model="item.subtext" class="sheet-input" type="text" maxlength="200" placeholder="Note" aria-label="Service note">
                              </span>
                              <span class="row-tools">
                                <button type="button" class="mini" @click.stop="moveItem(section.id, item.id, -1)">↑</button>
                                <button type="button" class="mini" @click.stop="moveItem(section.id, item.id, 1)">↓</button>
                                <button type="button" class="mini danger" @click.stop="removeItem(section.id, item.id)">✕</button>
                              </span>
                            </td>
                            <td class="price-cell">
                              <table class="price-entry">
                                <tr>
                                  <td class="printed-price">
                                    <input v-model="item.price" class="sheet-input" type="text" maxlength="40" aria-label="Printed price">
                                  </td>
                                  <td class="new-price">&nbsp;</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </section>
                  </td>
                  <td>
                    <section
                      v-for="section in rightSections"
                      :key="section.id"
                      class="category"
                      :class="{ 'is-selected': selectedSectionId === section.id }"
                      @click="selectSection(section.id)"
                    >
                      <div class="sec-tools">
                        <button type="button" class="mini" title="Move up" @click.stop="moveSection(section.id, -1)">↑</button>
                        <button type="button" class="mini" title="Move down" @click.stop="moveSection(section.id, 1)">↓</button>
                        <button type="button" class="mini" title="Move to left" @click.stop="moveSectionColumn(section.id)">←</button>
                        <button type="button" class="mini" title="Add line" @click.stop="addBlankItem(section.id)">+</button>
                        <button type="button" class="mini" title="From catalog" @click.stop="openCatalogPicker(section.id)">☰</button>
                        <button type="button" class="mini danger" title="Remove section" @click.stop="removeSection(section.id)">✕</button>
                      </div>
                      <div class="category-title">
                        <input v-model="section.title" class="sheet-input" type="text" maxlength="120" aria-label="Section title">
                      </div>
                      <table class="service-table">
                        <colgroup>
                          <col class="check-column">
                          <col>
                          <col class="price-column">
                        </colgroup>
                        <tbody>
                          <tr
                            v-for="item in section.items"
                            :key="item.id"
                            :class="{ 'is-selected': selectedItemId === item.id }"
                            @click.stop="selectItem(section.id, item.id)"
                          >
                            <td class="check-cell"><span class="checkbox" /></td>
                            <td class="service-name">
                              <input v-model="item.name" class="sheet-input" type="text" maxlength="200" aria-label="Service name">
                              <span class="service-subtext">
                                <input v-model="item.subtext" class="sheet-input" type="text" maxlength="200" placeholder="Note" aria-label="Service note">
                              </span>
                              <span class="row-tools">
                                <button type="button" class="mini" @click.stop="moveItem(section.id, item.id, -1)">↑</button>
                                <button type="button" class="mini" @click.stop="moveItem(section.id, item.id, 1)">↓</button>
                                <button type="button" class="mini danger" @click.stop="removeItem(section.id, item.id)">✕</button>
                              </span>
                            </td>
                            <td class="price-cell">
                              <table class="price-entry">
                                <tr>
                                  <td class="printed-price">
                                    <input v-model="item.price" class="sheet-input" type="text" maxlength="40" aria-label="Printed price">
                                  </td>
                                  <td class="new-price">&nbsp;</td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </section>
                  </td>
                </tr>
              </table>
            </main>

            <main class="page page-back sl-paper-edit" aria-label="Service log sheet back">
              <table class="header">
                <tr>
                  <td>
                    <h2 class="company-name">{{ business.businessName }}</h2>
                    <div class="company-details" style="white-space: pre-line;">{{ companyDetailsHtml }}</div>
                  </td>
                  <td class="document-title">
                    <h1>Service Log Sheet</h1>
                    <p>Blank field log and work authorization</p>
                  </td>
                </tr>
              </table>
              <h2 class="back-title">Additional / Custom Work</h2>
              <p class="back-help">Use these lines for work not listed on the front — write service description, quantity, and total.</p>
              <table class="blank-work-table">
                <colgroup>
                  <col class="desc">
                  <col class="qty">
                  <col class="total">
                </colgroup>
                <thead>
                  <tr>
                    <th class="desc">Service Description</th>
                    <th class="qty">Quantity</th>
                    <th class="total">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in blankWorkRows" :key="row">
                    <td class="desc">&nbsp;</td>
                    <td class="qty">&nbsp;</td>
                    <td class="total">&nbsp;</td>
                  </tr>
                </tbody>
              </table>
            </main>
            </div>
          </div>
        </div>

        <aside v-if="showCatalogPicker" class="sl-wysiwyg-catalog">
          <div class="sl-wysiwyg-catalog-head">
            <h4>Add from catalog</h4>
            <button type="button" class="btn sm" @click="showCatalogPicker = false">Close</button>
          </div>
          <label class="fld" style="margin:0 0 8px;">
            <span class="sr-only">Search catalog</span>
            <input v-model="catalogQ" type="search" placeholder="Search catalog…">
          </label>
          <ul v-if="filteredCatalog.length" class="sl-wysiwyg-catalog-list">
            <li v-for="pick in filteredCatalog" :key="pick.id">
              <button type="button" class="sl-wysiwyg-catalog-row" @click="addCatalogItem(pick)">
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
    </div>
  </div>
</template>

<style scoped>
.sl-wysiwyg-scrim {
  align-items: stretch;
  padding: 0;
  background: rgba(15, 23, 42, 0.55);
}
.sl-wysiwyg {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  border-radius: 0;
  background: #e2e8f0;
  overflow: hidden;
}
.sl-wysiwyg-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #fff;
  border-bottom: 1px solid #cbd5e1;
}
.sl-wysiwyg-bar-text h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
}
.sl-wysiwyg-bar-text p {
  margin: 2px 0 0;
  color: #64748b;
  font-size: 12.5px;
}
.sl-wysiwyg-bar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.sl-wysiwyg-status {
  margin: 12px 16px;
}
.sl-wysiwyg-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  position: relative;
}
.sl-wysiwyg-body:has(.sl-wysiwyg-catalog) {
  grid-template-columns: 1fr 300px;
}
.sl-wysiwyg-stage {
  min-height: 0;
  overflow: auto;
  display: grid;
  place-items: center;
  padding: 16px;
}
.sl-wysiwyg-scale {
  width: 8.5in;
  transform-origin: top center;
}
.sl-wysiwyg-catalog {
  border-left: 1px solid #cbd5e1;
  background: #fff;
  padding: 12px;
  overflow: auto;
}
.sl-wysiwyg-catalog-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.sl-wysiwyg-catalog-head h4 {
  margin: 0;
  font-size: 13px;
}
.sl-wysiwyg-catalog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}
.sl-wysiwyg-catalog-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  text-align: left;
  cursor: pointer;
  font-size: 12.5px;
}
.sl-wysiwyg-catalog-row:hover { background: #f8fafc; }
.sl-wysiwyg-catalog-row strong { display: block; }
.sl-wysiwyg-catalog-row small { color: #94a3b8; }
.err {
  margin: 10px 14px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 13px;
}
.btn.sm {
  padding: 6px 10px;
  font-size: 12px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
@media (max-width: 900px) {
  .sl-wysiwyg-body:has(.sl-wysiwyg-catalog) {
    grid-template-columns: 1fr;
  }
  .sl-wysiwyg-catalog {
    position: absolute;
    inset: auto 0 0 0;
    max-height: 40%;
    border-left: 0;
    border-top: 1px solid #cbd5e1;
  }
}
</style>
