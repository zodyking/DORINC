<script setup lang="ts">
import { catalogItemSub, type CatalogQuickItem } from '~/utils/invoice-editor-ui'
import { catalogTypeLabel, catalogTypePill, type CatalogItemType } from '~/utils/catalog-ui'

export interface PackageFormValue {
  sku: string
  name: string
}

export interface PackageLineDraft {
  localId: string
  catalogItemId: string
  itemType: string
  name: string
  sku: string | null
  defaultPrice: string | null
  uom: string
  quantity: string
}

type ItemTypeFilter = 'all' | CatalogItemType

const model = defineModel<PackageFormValue>({ required: true })
const lines = defineModel<PackageLineDraft[]>('lines', { required: true })

defineProps<{
  busy?: boolean
  submitLabel: string
  error?: string
  editing?: boolean
}>()

const emit = defineEmits<{ submit: [], cancel: [], archive: [] }>()

const searchQ = ref('')
const itemTypeFilter = ref<ItemTypeFilter>('all')
const searchOpen = ref(false)
const searchBusy = ref(false)
const searchResults = ref<CatalogQuickItem[]>([])
const activeIndex = ref(0)
const searchInput = ref<HTMLInputElement | null>(null)
const listId = useId()

let searchTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

const typeFilters: { key: ItemTypeFilter, label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'part', label: 'Parts' },
  { key: 'labor', label: 'Labor' },
  { key: 'fee', label: 'Fees' },
]

const emptyMessage = computed(() => {
  if (searchBusy.value) return ''
  if (!searchQ.value.trim()) return 'Type to search parts, labor, and fees — or pick a type filter.'
  return `No catalog items match “${searchQ.value.trim()}”.`
})

const showResults = computed(() =>
  searchOpen.value && (searchBusy.value || searchResults.value.length > 0 || !!emptyMessage.value),
)

function newLocalId() {
  return `pkg-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

watch([searchQ, itemTypeFilter], () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void runSearch(searchQ.value) }, 180)
})

async function runSearch(q: string) {
  const seq = ++searchSeq
  searchBusy.value = true
  try {
    const data = await $fetch<{ items: CatalogQuickItem[] }>('/api/catalog/items', {
      query: {
        q: q.trim() || undefined,
        itemType: itemTypeFilter.value === 'all' ? undefined : itemTypeFilter.value,
        pageSize: 16,
        sort: 'name-asc',
      },
    })
    if (seq !== searchSeq) return
    searchResults.value = data.items.map(item => ({
      id: item.id,
      itemType: item.itemType,
      sku: item.sku,
      name: item.name,
      defaultPrice: item.defaultPrice,
      uom: item.uom,
    }))
    activeIndex.value = searchResults.value.length ? 0 : -1
  }
  catch {
    if (seq !== searchSeq) return
    searchResults.value = []
    activeIndex.value = -1
  }
  finally {
    if (seq === searchSeq) searchBusy.value = false
  }
}

function openSearch() {
  searchOpen.value = true
  void runSearch(searchQ.value)
}

function closeSearch() {
  searchOpen.value = false
  activeIndex.value = -1
}

function onSearchBlur() {
  blurTimer = setTimeout(closeSearch, 150)
}

function onSearchFocus() {
  if (blurTimer) clearTimeout(blurTimer)
  openSearch()
}

function addCatalogItem(item: CatalogQuickItem) {
  if (lines.value.some(line => line.catalogItemId === item.id)) return
  lines.value = [...lines.value, {
    localId: newLocalId(),
    catalogItemId: item.id,
    itemType: item.itemType,
    name: item.name,
    sku: item.sku,
    defaultPrice: item.defaultPrice,
    uom: item.uom,
    quantity: '1',
  }]
  searchQ.value = ''
  searchResults.value = []
  activeIndex.value = -1
  nextTick(() => searchInput.value?.focus())
}

function selectActiveItem() {
  const item = searchResults.value[activeIndex.value]
  if (item) addCatalogItem(item)
}

function onSearchKeydown(e: KeyboardEvent) {
  if (!showResults.value && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    openSearch()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!searchResults.value.length) return
    activeIndex.value = (activeIndex.value + 1) % searchResults.value.length
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!searchResults.value.length) return
    activeIndex.value = (activeIndex.value - 1 + searchResults.value.length) % searchResults.value.length
  }
  else if (e.key === 'Enter') {
    e.preventDefault()
    selectActiveItem()
  }
  else if (e.key === 'Escape') {
    closeSearch()
  }
}

function removeLine(localId: string) {
  lines.value = lines.value.filter(line => line.localId !== localId)
}

function setLineQuantity(localId: string, quantity: string) {
  lines.value = lines.value.map(line =>
    line.localId === localId ? { ...line, quantity } : line,
  )
}

function moveLine(localId: string, direction: -1 | 1) {
  const index = lines.value.findIndex(line => line.localId === localId)
  if (index < 0) return
  const target = index + direction
  if (target < 0 || target >= lines.value.length) return
  const next = [...lines.value]
  const [row] = next.splice(index, 1)
  next.splice(target, 0, row!)
  lines.value = next
}

function qtyLabel(itemType: string) {
  return itemType === 'labor' ? 'Hrs' : 'Qty'
}

function setTypeFilter(filter: ItemTypeFilter) {
  itemTypeFilter.value = filter
}
</script>

<template>
  <form class="pkg-form" @submit.prevent="emit('submit')">
    <div class="mbody">
      <p v-if="error" class="help" style="color:#dc2626; margin:0 0 12px;">{{ error }}</p>

      <div class="grid2">
        <label class="fld">
          <span>Package name <b>*</b></span>
          <input v-model="model.name" type="text" required maxlength="200" placeholder="e.g. PM service kit">
        </label>
        <label class="fld">
          <span>SKU / code</span>
          <input v-model="model.sku" type="text" maxlength="40" placeholder="Optional">
        </label>
      </div>

      <div class="pkg-picker">
        <div class="pkg-picker-head">
          <h4>Add parts, labor & fees</h4>
          <div class="pkg-type-chips" role="tablist" aria-label="Catalog item type">
            <button
              v-for="chip in typeFilters"
              :key="chip.key"
              type="button"
              class="pkg-type-chip"
              :class="{ on: itemTypeFilter === chip.key }"
              role="tab"
              :aria-selected="itemTypeFilter === chip.key"
              @click="setTypeFilter(chip.key)"
            >
              {{ chip.label }}
            </button>
          </div>
        </div>

        <div class="pkg-search-wrap">
          <input
            ref="searchInput"
            v-model="searchQ"
            type="search"
            placeholder="Search catalog — name, SKU, description…"
            aria-label="Search catalog items to add to package"
            :aria-controls="listId"
            :aria-expanded="showResults"
            autocomplete="off"
            @focus="onSearchFocus"
            @blur="onSearchBlur"
            @keydown="onSearchKeydown"
          >
          <div
            v-if="showResults"
            :id="listId"
            class="pkg-search-panel"
            role="listbox"
            aria-label="Catalog search results"
          >
            <p v-if="searchBusy" class="help pkg-search-empty">Searching…</p>
            <p v-else-if="!searchResults.length" class="help pkg-search-empty">{{ emptyMessage }}</p>
            <button
              v-for="(item, index) in searchResults"
              :key="item.id"
              type="button"
              class="pkg-search-hit"
              :class="{ active: index === activeIndex }"
              role="option"
              :aria-selected="index === activeIndex"
              @mousedown.prevent="addCatalogItem(item)"
            >
              <span :class="catalogTypePill(item.itemType)">{{ catalogTypeLabel(item.itemType) }}</span>
              <span class="pkg-search-hit-main">
                <span class="lead">{{ item.name }}</span>
                <span class="sub">{{ catalogItemSub(item) }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <div class="pkg-lines">
        <h4>Included items <span v-if="lines.length" class="pkg-lines-count">{{ lines.length }}</span></h4>

        <ul v-if="lines.length" class="pkg-line-list" aria-label="Package included items">
          <li
            v-for="(line, index) in lines"
            :key="line.localId"
            class="pkg-line"
          >
            <div class="pkg-line-main">
              <div class="pkg-line-title">
                <span :class="catalogTypePill(line.itemType)">{{ catalogTypeLabel(line.itemType) }}</span>
                <span class="pkg-line-name">{{ line.name }}</span>
              </div>
              <p v-if="line.sku || line.uom" class="pkg-line-meta">
                <span v-if="line.sku" class="mono">{{ line.sku }}</span>
                <span v-if="line.sku && line.uom"> · </span>
                <span v-if="line.uom">{{ line.uom }}</span>
              </p>
            </div>

            <label class="pkg-line-qty fld">
              <span>{{ qtyLabel(line.itemType) }}</span>
              <input
                :value="line.quantity"
                type="text"
                inputmode="decimal"
                maxlength="30"
                :aria-label="`${qtyLabel(line.itemType)} for ${line.name}`"
                @input="setLineQuantity(line.localId, ($event.target as HTMLInputElement).value)"
              >
            </label>

            <div class="pkg-line-actions">
              <button
                type="button"
                class="btn ghost sm"
                :disabled="index === 0"
                aria-label="Move up"
                @click="moveLine(line.localId, -1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="btn ghost sm"
                :disabled="index === lines.length - 1"
                aria-label="Move down"
                @click="moveLine(line.localId, 1)"
              >
                ↓
              </button>
              <button
                type="button"
                class="pkg-line-remove"
                aria-label="Remove item"
                @click="removeLine(line.localId)"
              >
                Remove
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="help pkg-lines-empty">Search above to add items — each becomes an invoice line when the package is applied.</p>
      </div>
    </div>

    <div class="mfoot">
      <button v-if="editing" type="button" class="btn danger ghost" :disabled="busy" @click="emit('archive')">
        Archive package
      </button>
      <div class="right">
        <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="btn primary" :disabled="busy || !model.name.trim() || !lines.length">
          {{ submitLabel }}
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.pkg-form .mfoot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pkg-picker {
  margin-top: 18px;
  padding: 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: var(--surface-2, #f8fafc);
}

.pkg-picker-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.pkg-picker-head h4 {
  margin: 0;
  font-size: 14px;
}

.pkg-type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pkg-type-chip {
  padding: 5px 10px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 999px;
  background: #fff;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted, #64748b);
  cursor: pointer;
}

.pkg-type-chip.on {
  border-color: #6366f1;
  background: #eef2ff;
  color: #4338ca;
}

.pkg-search-wrap {
  position: relative;
}

.pkg-search-wrap input {
  width: 100%;
}

.pkg-search-panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 280px;
  overflow: auto;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
}

.pkg-search-empty {
  margin: 10px 12px;
}

.pkg-search-hit {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.pkg-search-hit:hover,
.pkg-search-hit.active {
  background: #f1f5f9;
}

.pkg-search-hit-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pkg-search-hit-main .lead {
  font-weight: 600;
}

.pkg-lines {
  margin-top: 18px;
}

.pkg-lines h4 {
  margin: 0 0 10px;
  font-size: 14px;
}

.pkg-lines-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4338ca;
  font-size: 11px;
  font-weight: 700;
  vertical-align: middle;
}

.pkg-lines-empty {
  margin: 0;
}

.pkg-line-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pkg-line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 88px auto;
  gap: 10px 12px;
  align-items: end;
  padding: 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: #fff;
}

.pkg-line-main {
  min-width: 0;
}

.pkg-line-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.pkg-line-name {
  font-weight: 600;
  color: #0f172a;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.pkg-line-meta {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted, #64748b);
}

.pkg-line-qty {
  margin: 0;
}

.pkg-line-qty span {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.pkg-line-qty input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 15px;
  padding: 8px 10px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: #0f172a;
}

.pkg-line-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex-wrap: wrap;
}

.pkg-line-remove {
  appearance: none;
  border: 1px solid #fecaca;
  background: #fff;
  color: #b91c1c;
  border-radius: 8px;
  padding: 7px 10px;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.pkg-line-remove:hover {
  background: #fef2f2;
}

@media (max-width: 640px) {
  .pkg-line {
    grid-template-columns: minmax(0, 1fr) 88px;
  }

  .pkg-line-actions {
    grid-column: 1 / -1;
    justify-content: stretch;
  }

  .pkg-line-actions .btn,
  .pkg-line-remove {
    flex: 1;
  }
}
</style>
