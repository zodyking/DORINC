<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import { formatSheetPriceDisplay } from '~/utils/service-log-sheet-display'

interface SheetItem {
  id: string
  name: string
  description: string | null
  defaultPrice: string | null
  itemType: string
  categoryId: string | null
  categoryName: string | null
  categorySortOrder: number
  included: boolean
}

interface SheetPayload {
  settings: { mode: 'all' | 'selected', itemIds: string[] }
  catalogItems: SheetItem[]
  includedCount: number
  totalCatalogCount: number
}

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ saved: [] }>()

const pending = ref(false)
const saving = ref(false)
const error = ref('')
const q = ref('')
const mode = ref<'all' | 'selected'>('all')
const selected = ref<Set<string>>(new Set())
const items = ref<SheetItem[]>([])
const loaded = ref(false)

const filteredItems = computed(() => {
  const term = q.value.trim().toLowerCase()
  const list = items.value
  if (!term) return list
  return list.filter((item) => {
    const hay = [
      item.name,
      item.description ?? '',
      item.categoryName ?? '',
      item.itemType,
    ].join(' ').toLowerCase()
    return hay.includes(term)
  })
})

const grouped = computed(() => {
  const map = new Map<string, { name: string, sortOrder: number, items: SheetItem[] }>()
  for (const item of filteredItems.value) {
    const key = item.categoryId ?? '__uncategorized__'
    let group = map.get(key)
    if (!group) {
      group = {
        name: item.categoryName?.trim() || 'Uncategorized',
        sortOrder: item.categorySortOrder ?? 9999,
        items: [],
      }
      map.set(key, group)
    }
    group.items.push(item)
  }
  return [...map.values()].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.name.localeCompare(b.name)
  })
})

const selectedCount = computed(() => {
  if (mode.value === 'all') return items.value.length
  return selected.value.size
})

function isChecked(id: string): boolean {
  if (mode.value === 'all') return true
  return selected.value.has(id)
}

function toggleItem(id: string) {
  if (mode.value === 'all') {
    // Switching from all → selected with this item flipped off
    mode.value = 'selected'
    selected.value = new Set(items.value.map(i => i.id).filter(itemId => itemId !== id))
    return
  }
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function selectAllVisible() {
  mode.value = 'selected'
  const next = new Set(selected.value)
  for (const item of filteredItems.value) next.add(item.id)
  selected.value = next
}

function clearVisible() {
  mode.value = 'selected'
  const next = new Set(selected.value)
  for (const item of filteredItems.value) next.delete(item.id)
  selected.value = next
}

function useAllCatalog() {
  mode.value = 'all'
  selected.value = new Set(items.value.map(i => i.id))
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const data = await $fetch<SheetPayload>('/api/service-logs/sheet')
    items.value = data.catalogItems
    mode.value = data.settings.mode
    selected.value = new Set(
      data.settings.mode === 'all'
        ? data.catalogItems.map(i => i.id)
        : data.settings.itemIds,
    )
    loaded.value = true
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not load service log sheet settings')
  }
  finally {
    pending.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    q.value = ''
    void load()
  }
})

function close() {
  open.value = false
  error.value = ''
}

async function save() {
  saving.value = true
  error.value = ''
  try {
    const body = mode.value === 'all'
      ? { mode: 'all' as const, itemIds: [] as string[] }
      : { mode: 'selected' as const, itemIds: [...selected.value] }

    await $fetch('/api/service-logs/sheet', { method: 'PUT', body })
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
          <p>Choose which catalog parts, labor, and fees print on the blank mechanic sheet</p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="close">✕</button>
      </div>

      <div class="mbody">
        <p v-if="error" class="err">{{ error }}</p>
        <p v-else-if="pending" class="help">Loading catalog…</p>

        <template v-else-if="loaded">
          <div class="sl-sheet-toolbar">
            <label class="fld sl-sheet-search">
              <span class="sr-only">Search catalog</span>
              <input v-model="q" type="search" placeholder="Search catalog…" aria-label="Search catalog">
            </label>
            <div class="sl-sheet-actions">
              <button type="button" class="btn sm" :disabled="!items.length" @click="useAllCatalog">
                Include all
              </button>
              <button type="button" class="btn sm" :disabled="!filteredItems.length" @click="selectAllVisible">
                Select visible
              </button>
              <button type="button" class="btn sm" :disabled="!filteredItems.length" @click="clearVisible">
                Clear visible
              </button>
            </div>
          </div>

          <p class="help sl-sheet-count">
            {{ selectedCount }} of {{ items.length }} catalog items will print
            <span v-if="mode === 'all'"> · showing entire catalog</span>
          </p>

          <div v-if="!items.length" class="empty" style="display:block;">
            No active catalog items yet. Add parts, labor, or fees in Catalog first.
          </div>

          <div v-else class="sl-sheet-groups">
            <section v-for="group in grouped" :key="group.name" class="sl-sheet-group">
              <h4>{{ group.name }}</h4>
              <ul>
                <li v-for="item in group.items" :key="item.id">
                  <label class="sl-sheet-row">
                    <input
                      type="checkbox"
                      :checked="isChecked(item.id)"
                      :aria-label="`Include ${item.name}`"
                      @change="toggleItem(item.id)"
                    >
                    <span class="sl-sheet-row-main">
                      <span class="sl-sheet-name">{{ item.name }}</span>
                      <span v-if="item.description" class="sl-sheet-desc">{{ item.description }}</span>
                    </span>
                    <span class="sl-sheet-meta">
                      <span class="pill">{{ item.itemType }}</span>
                      <span class="sl-sheet-price">{{ formatSheetPriceDisplay(item.defaultPrice) }}</span>
                    </span>
                  </label>
                </li>
              </ul>
            </section>
          </div>
        </template>
      </div>

      <div class="mfoot">
        <button type="button" class="btn" :disabled="saving" @click="close">Cancel</button>
        <button
          type="button"
          class="btn primary"
          :disabled="saving || pending || !loaded"
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
  width: min(720px, 96vw);
  max-height: min(88vh, 860px);
}
.sl-sheet-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  margin-bottom: 8px;
}
.sl-sheet-search {
  flex: 1;
  min-width: 180px;
  margin: 0;
}
.sl-sheet-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sl-sheet-count {
  margin: 0 0 12px;
}
.sl-sheet-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: min(48vh, 420px);
  overflow: auto;
  padding-right: 2px;
}
.sl-sheet-group h4 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #64748b;
}
.sl-sheet-group ul {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: hidden;
}
.sl-sheet-group li {
  border-bottom: 1px solid #f1f5f9;
}
.sl-sheet-group li:last-child {
  border-bottom: none;
}
.sl-sheet-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 12px;
  cursor: pointer;
}
.sl-sheet-row:hover {
  background: #f8fafc;
}
.sl-sheet-row input {
  margin-top: 3px;
  flex-shrink: 0;
}
.sl-sheet-row-main {
  flex: 1;
  min-width: 0;
}
.sl-sheet-name {
  display: block;
  font-size: 13.5px;
  font-weight: 600;
  color: #0f172a;
}
.sl-sheet-desc {
  display: block;
  margin-top: 2px;
  font-size: 11.5px;
  color: #94a3b8;
  line-height: 1.35;
}
.sl-sheet-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}
.sl-sheet-price {
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
.btn.sm {
  padding: 6px 10px;
  font-size: 12px;
}
@media (max-width: 560px) {
  .sl-sheet-row {
    flex-wrap: wrap;
  }
  .sl-sheet-meta {
    width: 100%;
    flex-direction: row;
    justify-content: space-between;
    padding-left: 22px;
  }
}
</style>
