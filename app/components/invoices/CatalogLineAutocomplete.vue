<script setup lang="ts">
// Catalog typeahead for invoice line descriptions — Arrow keys + Enter to fill the row.
import { catalogItemSub, type CatalogQuickItem } from '~/utils/invoice-editor-ui'
import { catalogTypeLabel, type CatalogItemType } from '~/utils/catalog-ui'
import { useProseField } from '~/composables/useProseField'

const model = defineModel<string>({ required: true })

const props = withDefaults(defineProps<{
  disabled?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  placeholder: 'Description — type to search catalog',
})

const emit = defineEmits<{
  select: [item: CatalogQuickItem]
  typed: []
  blur: []
  focus: []
}>()

const { inputAttrs, onInput: proseOnInput, onBlur: proseOnBlur } = useProseField(model, ref('prose'))

const open = ref(false)
const activeIndex = ref(0)
const searching = ref(false)
const items = ref<CatalogQuickItem[]>([])
const fetchError = ref('')
const hasSearched = ref(false)
const inputEl = ref<HTMLInputElement | null>(null)
const listId = useId()
const panelStyle = ref<Record<string, string>>({})

const requestFetch = useRequestFetch()

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

const emptyMessage = computed(() => {
  if (searching.value) return ''
  if (fetchError.value) return fetchError.value
  if (!hasSearched.value) return ''
  if (!model.value.trim()) return 'No catalog items yet — add items in Catalog or import from Control Panel.'
  return `No catalog items match “${model.value.trim()}”.`
})

const showList = computed(() =>
  open.value
  && !props.disabled
  && (searching.value || items.value.length > 0 || !!emptyMessage.value),
)

function updatePanelPosition() {
  const el = inputEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const width = Math.max(rect.width, 280)
  const left = Math.min(rect.left, window.innerWidth - width - 8)
  panelStyle.value = {
    position: 'fixed',
    top: `${Math.round(rect.bottom + 4)}px`,
    left: `${Math.round(Math.max(8, left))}px`,
    width: `${Math.round(width)}px`,
  }
}

async function runSearch(q: string) {
  const seq = ++searchSeq
  searching.value = true
  fetchError.value = ''
  try {
    const res = await requestFetch<{ items: CatalogQuickItem[], total?: number }>('/api/catalog/items', {
      query: {
        q: q.trim() || undefined,
        pageSize: 12,
        sort: 'name-asc',
      },
    })
    if (seq !== searchSeq) return
    items.value = res.items ?? []
    activeIndex.value = items.value.length ? 0 : -1
    hasSearched.value = true
    updatePanelPosition()
  }
  catch (err: unknown) {
    if (seq !== searchSeq) return
    items.value = []
    hasSearched.value = true
    fetchError.value = (err as { data?: { message?: string } })?.data?.message
      ?? 'Could not load catalog items. Refresh and try again.'
  }
  finally {
    if (seq === searchSeq) searching.value = false
  }
}

function scheduleSearch(q: string) {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void runSearch(q)
  }, 180)
}

function openSuggestions() {
  if (props.disabled) return
  open.value = true
  updatePanelPosition()
  scheduleSearch(model.value)
}

function closeSuggestions() {
  open.value = false
  activeIndex.value = 0
}

function pick(item: CatalogQuickItem) {
  // Keep focus; parent fills the row. Avoid a trailing blur save racing the select handler.
  if (blurTimer) {
    clearTimeout(blurTimer)
    blurTimer = null
  }
  emit('select', item)
  closeSuggestions()
  items.value = []
}

function onInput(event: Event) {
  proseOnInput(event)
  open.value = true
  updatePanelPosition()
  scheduleSearch(model.value)
  emit('typed')
}

function onFocus() {
  if (blurTimer) {
    clearTimeout(blurTimer)
    blurTimer = null
  }
  emit('focus')
  openSuggestions()
}

function onBlur() {
  proseOnBlur()
  blurTimer = setTimeout(() => {
    closeSuggestions()
    emit('blur')
  }, 120)
}

function moveActive(delta: number) {
  if (!items.value.length) return
  const next = activeIndex.value + delta
  activeIndex.value = ((next % items.value.length) + items.value.length) % items.value.length
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!open.value) openSuggestions()
    else moveActive(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!open.value) openSuggestions()
    else moveActive(-1)
    return
  }
  if (e.key === 'Enter') {
    if (open.value && items.value.length && activeIndex.value >= 0) {
      const item = items.value[activeIndex.value]
      if (item) {
        e.preventDefault()
        pick(item)
      }
    }
    return
  }
  if (e.key === 'Escape') {
    if (open.value) {
      e.preventDefault()
      closeSuggestions()
    }
  }
}

function typeLabel(itemType: string): string {
  return catalogTypeLabel(itemType as CatalogItemType)
}

function focus() {
  inputEl.value?.focus()
}

defineExpose({ focus })

function onWindowReposition() {
  if (showList.value) updatePanelPosition()
}

onMounted(() => {
  window.addEventListener('resize', onWindowReposition)
  window.addEventListener('scroll', onWindowReposition, true)
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (blurTimer) clearTimeout(blurTimer)
  window.removeEventListener('resize', onWindowReposition)
  window.removeEventListener('scroll', onWindowReposition, true)
})
</script>

<template>
  <div class="cat-ac">
    <input
      ref="inputEl"
      :value="model"
      v-bind="inputAttrs"
      type="text"
      role="combobox"
      :placeholder="placeholder"
      :disabled="disabled"
      autocomplete="off"
      aria-autocomplete="list"
      :aria-expanded="showList"
      :aria-controls="listId"
      :aria-activedescendant="showList && items[activeIndex] ? `${listId}-${items[activeIndex]!.id}` : undefined"
      @input="onInput"
      @focus="onFocus"
      @blur="onBlur"
      @keydown="onKeydown"
    >
    <Teleport to="body">
      <ul
        v-show="showList"
        :id="listId"
        class="cat-ac-list"
        role="listbox"
        :style="panelStyle"
        :aria-label="searching ? 'Searching catalog' : 'Catalog matches'"
      >
        <li v-if="searching && !items.length" class="cat-ac-empty" role="presentation">
          Searching…
        </li>
        <li v-else-if="emptyMessage" class="cat-ac-empty" role="presentation">
          {{ emptyMessage }}
        </li>
        <li
          v-for="(item, i) in items"
          :id="`${listId}-${item.id}`"
          :key="item.id"
          role="option"
          class="cat-ac-option"
          :class="{ on: i === activeIndex }"
          :aria-selected="i === activeIndex"
          @mousedown.prevent="pick(item)"
          @mouseenter="activeIndex = i"
        >
          <span class="cat-ac-main">
            <b>{{ item.name }}</b>
            <span class="cat-ac-sub">{{ catalogItemSub(item) }}</span>
          </span>
          <span class="cat-ac-type">{{ typeLabel(item.itemType) }}</span>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
.cat-ac {
  position: relative;
  width: 100%;
}
.cat-ac input {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  padding: 8px 10px;
  color: #0f172a;
}
.cat-ac input:focus {
  outline: 2px solid #c7d2fe;
  outline-offset: 1px;
  border-color: #a5b4fc;
}
</style>

<style>
.cat-ac-list {
  z-index: 10050;
  margin: 0;
  padding: 6px;
  list-style: none;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
  max-height: 260px;
  overflow: auto;
}
.cat-ac-option {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.cat-ac-option.on,
.cat-ac-option:hover {
  background: #eef2ff;
}
.cat-ac-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.cat-ac-main b {
  font-size: 13px;
  font-weight: 650;
  color: #0f172a;
}
.cat-ac-sub {
  font-size: 12px;
  color: #94a3b8;
}
.cat-ac-type {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  padding-top: 2px;
}
.cat-ac-empty {
  padding: 10px 12px;
  font-size: 12.5px;
  color: #94a3b8;
}
</style>
