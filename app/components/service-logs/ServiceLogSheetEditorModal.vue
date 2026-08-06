<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { formatSheetPriceDisplay } from '~/utils/service-log-sheet-display'
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

interface SheetPayload {
  document: ServiceLogSheetDocument
  catalogItems: CatalogPick[]
}

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const pending = ref(false)
const saving = ref(false)
const error = ref('')
const document = ref<ServiceLogSheetDocument | null>(null)
const catalogItems = ref<CatalogPick[]>([])
const catalogQ = ref('')
const catalogTargetSectionId = ref<string | null>(null)
const showCatalogPicker = ref(false)

const leftSections = computed(() =>
  (document.value?.sections ?? []).filter(s => s.column === 'left'),
)
const rightSections = computed(() =>
  (document.value?.sections ?? []).filter(s => s.column === 'right'),
)

const filteredCatalog = computed(() => {
  const term = catalogQ.value.trim().toLowerCase()
  const list = catalogItems.value
  if (!term) return list.slice(0, 80)
  return list.filter((item) => {
    const hay = [item.name, item.description ?? '', item.categoryName ?? '', item.itemType].join(' ').toLowerCase()
    return hay.includes(term)
  }).slice(0, 80)
})

const itemCount = computed(() =>
  (document.value?.sections ?? []).reduce((n, s) => n + s.items.length, 0),
)

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Date.now().toString(36)}`
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const data = await $fetch<SheetPayload>('/api/service-logs/sheet')
    document.value = structuredClone(data.document)
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
    void load()
  }
})

function close() {
  open.value = false
  error.value = ''
}

function findSection(sectionId: string): ServiceLogSheetSection | undefined {
  return document.value?.sections.find(s => s.id === sectionId)
}

function addSection(column: 'left' | 'right') {
  if (!document.value) return
  document.value.sections.push({
    id: newId('sec'),
    title: 'New section',
    column,
    items: [],
  })
}

function removeSection(sectionId: string) {
  if (!document.value) return
  const section = findSection(sectionId)
  if (!section) return
  if (section.items.length && !window.confirm(`Remove section "${section.title}" and its ${section.items.length} items?`)) {
    return
  }
  document.value.sections = document.value.sections.filter(s => s.id !== sectionId)
}

function moveSection(sectionId: string, direction: -1 | 1) {
  if (!document.value) return
  const section = findSection(sectionId)
  if (!section) return
  const same = document.value.sections.filter(s => s.column === section.column)
  const idx = same.findIndex(s => s.id === sectionId)
  const swapWith = same[idx + direction]
  if (!swapWith) return

  const all = document.value.sections
  const a = all.findIndex(s => s.id === sectionId)
  const b = all.findIndex(s => s.id === swapWith.id)
  const tmp = all[a]!
  all[a] = all[b]!
  all[b] = tmp
}

function moveSectionToColumn(sectionId: string, column: 'left' | 'right') {
  const section = findSection(sectionId)
  if (!section) return
  section.column = column
}

function addBlankItem(sectionId: string) {
  const section = findSection(sectionId)
  if (!section) return
  section.items.push({
    id: newId('item'),
    name: 'New service',
    subtext: '',
    price: '$0',
    catalogItemId: null,
  })
}

function removeItem(sectionId: string, itemId: string) {
  const section = findSection(sectionId)
  if (!section) return
  section.items = section.items.filter(i => i.id !== itemId)
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

function openCatalogPicker(sectionId: string) {
  catalogTargetSectionId.value = sectionId
  catalogQ.value = ''
  showCatalogPicker.value = true
}

function addCatalogItem(pick: CatalogPick) {
  const sectionId = catalogTargetSectionId.value
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
  showCatalogPicker.value = false
  catalogTargetSectionId.value = null
}

async function resetDefault() {
  if (!window.confirm('Reset the sheet to the default Letter service catalog template? Your current edits will be replaced.')) {
    return
  }
  saving.value = true
  error.value = ''
  try {
    const res = await $fetch<{ document: ServiceLogSheetDocument }>('/api/service-logs/sheet/reset', {
      method: 'POST',
    })
    document.value = structuredClone(res.document)
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not reset sheet')
  }
  finally {
    saving.value = false
  }
}

async function save() {
  if (!document.value) return
  saving.value = true
  error.value = ''
  try {
    // Drop empty-named lines; keep structure otherwise
    const cleaned: ServiceLogSheetDocument = {
      version: 2,
      sections: document.value.sections
        .map(section => ({
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
    class="modal-scrim"
    :class="{ open }"
    :aria-hidden="!open"
    @click="onScrimClick"
  >
    <div
      class="modal sl-sheet-modal"
      role="dialog"
      aria-labelledby="sl-sheet-title"
      aria-modal="true"
      @click.stop
    >
      <div class="mhead">
        <div>
          <h3 id="sl-sheet-title">Edit Service Log Sheet</h3>
          <p>Edit Letter-size sections and services — custom lines or add from catalog</p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="close">✕</button>
      </div>

      <div class="mbody">
        <p v-if="error" class="err">{{ error }}</p>
        <p v-else-if="pending" class="help">Loading sheet…</p>

        <template v-else-if="document">
          <div class="sl-sheet-toolbar">
            <p class="help" style="margin:0;">
              {{ document.sections.length }} sections · {{ itemCount }} services · Letter 8.5×11 two-column layout
            </p>
            <div class="sl-sheet-toolbar-actions">
              <button type="button" class="btn sm" :disabled="saving" @click="resetDefault">
                Reset to default template
              </button>
            </div>
          </div>

          <div class="sl-sheet-columns">
            <div class="sl-sheet-col">
              <div class="sl-sheet-col-head">
                <h4>Left column</h4>
                <button type="button" class="btn sm" @click="addSection('left')">+ Section</button>
              </div>
              <article
                v-for="section in leftSections"
                :key="section.id"
                class="sl-sheet-section"
              >
                <div class="sl-sheet-section-head">
                  <input
                    v-model="section.title"
                    class="sl-sheet-section-title"
                    type="text"
                    maxlength="120"
                    aria-label="Section title"
                  >
                  <div class="sl-sheet-section-ops">
                    <button type="button" class="btn sm" title="Move up" @click="moveSection(section.id, -1)">↑</button>
                    <button type="button" class="btn sm" title="Move down" @click="moveSection(section.id, 1)">↓</button>
                    <button type="button" class="btn sm" title="Move to right column" @click="moveSectionToColumn(section.id, 'right')">→</button>
                    <button type="button" class="btn sm danger" @click="removeSection(section.id)">Remove</button>
                  </div>
                </div>
                <ul class="sl-sheet-items">
                  <li v-for="item in section.items" :key="item.id">
                    <div class="sl-sheet-item-fields">
                      <input v-model="item.name" type="text" maxlength="200" placeholder="Service name" aria-label="Service name">
                      <input v-model="item.subtext" type="text" maxlength="200" placeholder="Note (optional)" aria-label="Service note">
                      <input v-model="item.price" type="text" maxlength="40" placeholder="$0" aria-label="Printed price" class="sl-sheet-price-input">
                    </div>
                    <div class="sl-sheet-item-ops">
                      <button type="button" class="btn sm" @click="moveItem(section.id, item.id, -1)">↑</button>
                      <button type="button" class="btn sm" @click="moveItem(section.id, item.id, 1)">↓</button>
                      <button type="button" class="btn sm danger" @click="removeItem(section.id, item.id)">✕</button>
                    </div>
                  </li>
                </ul>
                <div class="sl-sheet-section-foot">
                  <button type="button" class="btn sm" @click="addBlankItem(section.id)">+ Custom item</button>
                  <button type="button" class="btn sm" @click="openCatalogPicker(section.id)">+ From catalog</button>
                </div>
              </article>
              <p v-if="!leftSections.length" class="help">No left-column sections yet.</p>
            </div>

            <div class="sl-sheet-col">
              <div class="sl-sheet-col-head">
                <h4>Right column</h4>
                <button type="button" class="btn sm" @click="addSection('right')">+ Section</button>
              </div>
              <article
                v-for="section in rightSections"
                :key="section.id"
                class="sl-sheet-section"
              >
                <div class="sl-sheet-section-head">
                  <input
                    v-model="section.title"
                    class="sl-sheet-section-title"
                    type="text"
                    maxlength="120"
                    aria-label="Section title"
                  >
                  <div class="sl-sheet-section-ops">
                    <button type="button" class="btn sm" title="Move up" @click="moveSection(section.id, -1)">↑</button>
                    <button type="button" class="btn sm" title="Move down" @click="moveSection(section.id, 1)">↓</button>
                    <button type="button" class="btn sm" title="Move to left column" @click="moveSectionToColumn(section.id, 'left')">←</button>
                    <button type="button" class="btn sm danger" @click="removeSection(section.id)">Remove</button>
                  </div>
                </div>
                <ul class="sl-sheet-items">
                  <li v-for="item in section.items" :key="item.id">
                    <div class="sl-sheet-item-fields">
                      <input v-model="item.name" type="text" maxlength="200" placeholder="Service name" aria-label="Service name">
                      <input v-model="item.subtext" type="text" maxlength="200" placeholder="Note (optional)" aria-label="Service note">
                      <input v-model="item.price" type="text" maxlength="40" placeholder="$0" aria-label="Printed price" class="sl-sheet-price-input">
                    </div>
                    <div class="sl-sheet-item-ops">
                      <button type="button" class="btn sm" @click="moveItem(section.id, item.id, -1)">↑</button>
                      <button type="button" class="btn sm" @click="moveItem(section.id, item.id, 1)">↓</button>
                      <button type="button" class="btn sm danger" @click="removeItem(section.id, item.id)">✕</button>
                    </div>
                  </li>
                </ul>
                <div class="sl-sheet-section-foot">
                  <button type="button" class="btn sm" @click="addBlankItem(section.id)">+ Custom item</button>
                  <button type="button" class="btn sm" @click="openCatalogPicker(section.id)">+ From catalog</button>
                </div>
              </article>
              <p v-if="!rightSections.length" class="help">No right-column sections yet.</p>
            </div>
          </div>

          <div v-if="showCatalogPicker" class="sl-sheet-catalog">
            <div class="sl-sheet-catalog-head">
              <h4>Add from catalog</h4>
              <button type="button" class="btn sm" @click="showCatalogPicker = false">Close</button>
            </div>
            <label class="fld" style="margin:0 0 8px;">
              <span class="sr-only">Search catalog</span>
              <input v-model="catalogQ" type="search" placeholder="Search catalog…">
            </label>
            <ul v-if="filteredCatalog.length" class="sl-sheet-catalog-list">
              <li v-for="pick in filteredCatalog" :key="pick.id">
                <button type="button" class="sl-sheet-catalog-row" @click="addCatalogItem(pick)">
                  <span class="sl-sheet-catalog-name">
                    {{ pick.name }}
                    <span v-if="pick.categoryName" class="sl-sheet-catalog-cat">{{ pick.categoryName }}</span>
                  </span>
                  <span class="sl-sheet-catalog-meta">
                    <span class="pill">{{ pick.itemType }}</span>
                    <span>{{ formatSheetPriceDisplay(pick.defaultPrice) }}</span>
                  </span>
                </button>
              </li>
            </ul>
            <p v-else class="help">No catalog matches.</p>
          </div>
        </template>
      </div>

      <div class="mfoot">
        <button type="button" class="btn" :disabled="saving" @click="close">Cancel</button>
        <button
          type="button"
          class="btn primary"
          :disabled="saving || pending || !document"
          @click="save"
        >
          {{ saving ? 'Saving…' : 'Save sheet' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sl-sheet-modal {
  width: min(1080px, 96vw);
  max-height: min(92vh, 920px);
}
.sl-sheet-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.sl-sheet-toolbar-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sl-sheet-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: start;
  max-height: min(52vh, 520px);
  overflow: auto;
  padding-right: 2px;
}
.sl-sheet-col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
  padding-bottom: 4px;
}
.sl-sheet-col-head h4 {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.sl-sheet-section {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
  background: #f8fafc;
}
.sl-sheet-section-head {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.sl-sheet-section-title {
  flex: 1;
  min-width: 140px;
  font-weight: 700;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sl-sheet-section-ops,
.sl-sheet-item-ops,
.sl-sheet-section-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.sl-sheet-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sl-sheet-items li {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 6px;
}
.sl-sheet-item-fields {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
}
.sl-sheet-item-fields input {
  width: 100%;
  font-size: 12.5px;
}
.sl-sheet-price-input {
  max-width: 100px;
  font-weight: 700;
}
.sl-sheet-section-foot {
  margin-top: 8px;
}
.sl-sheet-catalog {
  margin-top: 14px;
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
}
.sl-sheet-catalog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.sl-sheet-catalog-head h4 {
  margin: 0;
  font-size: 13px;
}
.sl-sheet-catalog-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.sl-sheet-catalog-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.sl-sheet-catalog-row:hover {
  background: #f8fafc;
}
.sl-sheet-catalog-name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}
.sl-sheet-catalog-cat {
  font-size: 11px;
  font-weight: 500;
  color: #94a3b8;
}
.sl-sheet-catalog-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #334155;
}
.err {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 13px;
}
.btn.sm {
  padding: 5px 8px;
  font-size: 12px;
}
.btn.sm.danger {
  color: #dc2626;
  border-color: #fecaca;
  background: #fff;
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
@media (max-width: 860px) {
  .sl-sheet-columns {
    grid-template-columns: 1fr;
  }
}
</style>
