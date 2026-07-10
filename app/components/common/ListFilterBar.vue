<script setup lang="ts">
const search = defineModel<string>('search', { default: '' })

const props = withDefaults(defineProps<{
  searchPlaceholder?: string
  searchAriaLabel?: string
  showSearch?: boolean
  filtersActive?: boolean
  countLabel?: string
  filterTitle?: string
  hasFilters?: boolean
}>(), {
  searchPlaceholder: 'Search…',
  showSearch: true,
  filtersActive: false,
  filterTitle: 'Filter & sort',
  hasFilters: undefined,
})

const emit = defineEmits<{ clearFilters: [] }>()

const slots = useSlots()
const sheetOpen = ref(false)

const showFilterButton = computed(() => {
  if (props.hasFilters !== undefined) return props.hasFilters
  return !!slots.filters
})

function closeSheet() {
  sheetOpen.value = false
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).dataset.scrim === 'filter-sheet') closeSheet()
}

function clearAndClose() {
  emit('clearFilters')
  closeSheet()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && sheetOpen.value) closeSheet()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="list-toolbar" :class="{ 'no-search': !showSearch }">
    <div class="list-toolbar-row">
      <p v-if="!showSearch && countLabel" class="list-toolbar-inline-count">
        {{ countLabel }}
      </p>
      <div v-if="showSearch" class="search list-toolbar-search">
        <span class="gl" aria-hidden="true">⌕</span>
        <input
          v-model="search"
          type="search"
          :placeholder="searchPlaceholder"
          :aria-label="searchAriaLabel ?? searchPlaceholder"
        >
      </div>
      <button
        v-if="showFilterButton"
        type="button"
        class="list-filter-btn"
        :class="{ active: filtersActive }"
        aria-label="Filter and sort"
        :aria-expanded="sheetOpen"
        @click="sheetOpen = true"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 6h16M7 12h10M10 18h4"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        <span v-if="filtersActive" class="list-filter-dot" aria-hidden="true" />
      </button>
    </div>
    <p v-if="countLabel && showSearch" class="list-toolbar-count">
      {{ countLabel }}
    </p>
  </div>

  <Teleport to="body">
    <div
      v-if="showFilterButton"
      class="filter-sheet-scrim"
      :class="{ open: sheetOpen }"
      data-scrim="filter-sheet"
      :aria-hidden="!sheetOpen"
      @click="onScrimClick"
    >
      <div
        class="filter-sheet"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="sheetOpen ? 'filter-sheet-title' : undefined"
        @click.stop
      >
        <div class="filter-sheet-head">
          <h3 id="filter-sheet-title">
            {{ filterTitle }}
          </h3>
          <button type="button" class="close" aria-label="Close" @click="closeSheet">
            ✕
          </button>
        </div>
        <div class="filter-sheet-body">
          <slot name="filters" />
        </div>
        <div class="filter-sheet-foot">
          <button type="button" class="btn" :disabled="!filtersActive" @click="clearAndClose">
            Clear all
          </button>
          <button type="button" class="btn primary" @click="closeSheet">
            Done
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
