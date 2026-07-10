<script setup lang="ts">
// Catalog list with search, type chips, add/edit modal (mockup: PAGE: CATALOG).
import CatalogItemForm, { type CatalogItemFormValue } from '~/components/catalog/CatalogItemForm.vue'
import CatalogCategoriesModal from '~/components/catalog/CategoriesModal.vue'
import type { CatalogItemType } from '~/utils/catalog-ui'
import { normalizeCatalogItemType } from '~/utils/catalog-ui'

definePageMeta({ layout: 'staff' })

interface CatalogItemRow {
  id: string
  itemType: CatalogItemType
  sku: string | null
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  defaultPrice: string | null
  cost: string | null
  markupPercent: string | null
  taxable: boolean
  uom: string
  vendor: string | null
  archivedAt: string | null
  createdAt: string
}

type TypeChip = 'all' | 'part' | 'service' | 'fee'

const auth = useAuthStore()
const canManage = computed(() => auth.can('catalog.manage.all'))

const q = ref('')
const fType = ref<TypeChip>('all')
const fSort = ref<'name-asc' | 'name-desc' | 'sku-asc' | 'newest'>('name-asc')
const page = ref(1)
const PAGE_SIZE = 25

watch([q, fType, fSort], () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  itemType: fType.value === 'all' ? undefined : fType.value,
  sort: fSort.value,
}))

const { data, refresh, pending, error: listError } = await useFetch<{ items: CatalogItemRow[], total: number }>(
  '/api/catalog/items',
  { query },
)

const { data: allCount, refresh: refreshAllCount } = await useFetch<{ total: number }>('/api/catalog/items', { query: { pageSize: 1 } })
const { data: partCount, refresh: refreshPartCount } = await useFetch<{ total: number }>('/api/catalog/items', { query: { itemType: 'part', pageSize: 1 } })
const { data: serviceCount, refresh: refreshServiceCount } = await useFetch<{ total: number }>('/api/catalog/items', { query: { itemType: 'service', pageSize: 1 } })
const { data: feeCount, refresh: refreshFeeCount } = await useFetch<{ total: number }>('/api/catalog/items', { query: { itemType: 'fee', pageSize: 1 } })

const { data: categoriesData, refresh: refreshCategories } = await useFetch<{ items: { id: string, name: string }[] }>(
  '/api/catalog/categories',
)

const items = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const categories = computed(() => categoriesData.value?.items ?? [])
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const filtersDirty = computed(() => !!q.value.trim() || fType.value !== 'all' || fSort.value !== 'name-asc')

function clearFilters() {
  q.value = ''
  fType.value = 'all'
  fSort.value = 'name-asc'
}

const listCountLabel = computed(() => {
  if (pending.value) return 'Loading…'
  if (!total.value) return 'No items'
  return rangeLabel.value
})

const chips = computed(() => [
  { key: 'all' as const, label: 'All', count: allCount.value?.total ?? 0 },
  { key: 'part' as const, label: 'Parts', count: partCount.value?.total ?? 0 },
  { key: 'service' as const, label: 'Services', count: serviceCount.value?.total ?? 0 },
  { key: 'fee' as const, label: 'Fees', count: feeCount.value?.total ?? 0 },
])

async function refreshCounts() {
  await Promise.all([
    refreshAllCount(),
    refreshPartCount(),
    refreshServiceCount(),
    refreshFeeCount(),
  ])
}

const rangeLabel = computed(() => {
  if (!total.value) return 'No items'
  const from = (page.value - 1) * PAGE_SIZE + 1
  const to = Math.min(page.value * PAGE_SIZE, total.value)
  return `Showing ${from}—${to} of ${total.value}`
})

// ---- Modals ----
const categoriesOpen = ref(false)
const itemModalOpen = ref(false)
const editingId = ref<string | null>(null)
const formBusy = ref(false)
const formError = ref('')

const emptyForm = (): CatalogItemFormValue => ({
  itemType: 'part',
  sku: '',
  name: '',
  description: '',
  categoryId: '',
  defaultPrice: '',
  cost: '',
  markupPercent: '',
  taxable: true,
  uom: 'each',
  vendor: '',
})

const form = reactive<CatalogItemFormValue>(emptyForm())

function openNewItem() {
  if (!canManage.value) return
  editingId.value = null
  Object.assign(form, emptyForm())
  formError.value = ''
  itemModalOpen.value = true
}

function openEditItem(row: CatalogItemRow) {
  if (!canManage.value) return
  editingId.value = row.id
  Object.assign(form, {
    itemType: normalizeCatalogItemType(row.itemType),
    sku: row.sku ?? '',
    name: row.name,
    description: row.description ?? '',
    categoryId: row.categoryId ?? '',
    defaultPrice: row.defaultPrice ?? '',
    cost: row.cost ?? '',
    markupPercent: row.markupPercent ?? '',
    taxable: row.taxable,
    uom: row.uom,
    vendor: row.vendor ?? '',
  })
  formError.value = ''
  itemModalOpen.value = true
}

function closeItemModal() {
  itemModalOpen.value = false
  editingId.value = null
  formError.value = ''
}

function onItemScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'cat-item-scrim') closeItemModal()
}

function bodyPayload() {
  return {
    itemType: form.itemType,
    sku: form.sku || null,
    name: form.name,
    description: form.description || null,
    categoryId: form.categoryId || null,
    defaultPrice: form.defaultPrice || null,
    cost: form.cost || null,
    markupPercent: form.markupPercent || null,
    taxable: form.taxable,
    uom: form.uom,
    vendor: form.vendor || null,
  }
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string, data?: { message?: string } } })?.data
  return data?.message ?? data?.data?.message ?? fallback
}

async function submitItem() {
  if (!form.name.trim()) {
    formError.value = 'Name is required'
    return
  }
  formBusy.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      await $fetch(`/api/catalog/items/${editingId.value}`, {
        method: 'PATCH',
        body: bodyPayload(),
      })
    }
    else {
      await $fetch('/api/catalog/items', {
        method: 'POST',
        body: bodyPayload(),
      })
    }
    closeItemModal()
    await Promise.all([refresh(), refreshCategories(), refreshCounts()])
  }
  catch (err) {
    formError.value = apiErrorMessage(err, 'Could not save catalog item')
  }
  finally {
    formBusy.value = false
  }
}

async function archiveItem() {
  if (!editingId.value) return
  if (!window.confirm('Archive this catalog item? It will be hidden from new invoice lines.')) return
  formBusy.value = true
  formError.value = ''
  try {
    await $fetch(`/api/catalog/items/${editingId.value}/archive`, { method: 'POST' })
    closeItemModal()
    await Promise.all([refresh(), refreshCounts()])
  }
  catch (err) {
    formError.value = apiErrorMessage(err, 'Could not archive item')
  }
  finally {
    formBusy.value = false
  }
}

async function onCategoriesChanged() {
  await refreshCategories()
}

function onRowClick(row: CatalogItemRow) {
  if (canManage.value) openEditItem(row)
}
</script>

<template>
  <section class="page active">
    <div class="pagehead">
      <div>
        <h2>Catalog</h2>
        <p>Parts, services, and fees for invoice lines</p>
      </div>
      <div class="actions">
        <button
          v-if="canManage"
          type="button"
          class="btn"
          @click="categoriesOpen = true"
        >
          Manage categories
        </button>
        <button
          v-if="canManage"
          type="button"
          class="btn primary"
          @click="openNewItem"
        >
          + New Item
        </button>
      </div>
    </div>

    <ListFilterBar
      v-model:search="q"
      search-placeholder="Search items, SKUs, categories…"
      search-aria-label="Search catalog items"
      :count-label="listCountLabel"
      :filters-active="filtersDirty"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <label class="fld">
          Item type
          <select v-model="fType" aria-label="Catalog item type">
            <option v-for="chip in chips" :key="chip.key" :value="chip.key">
              {{ chip.label }} · {{ chip.count }}
            </option>
          </select>
        </label>
        <label class="fld">
          Sort by
          <select v-model="fSort" aria-label="Sort catalog items">
            <option value="name-asc">Name A → Z</option>
            <option value="name-desc">Name Z → A</option>
            <option value="sku-asc">SKU A → Z</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
      </template>
    </ListFilterBar>

    <div class="card">
      <div class="tscroll">
        <table v-if="items.length" class="tbl cat-tbl">
          <thead>
            <tr>
              <th class="cell-item">Item</th>
              <th class="col-sku">SKU</th>
              <th class="col-cat">Category</th>
              <th class="col-type">Type</th>
              <th class="num col-price">Rate / Price</th>
            </tr>
          </thead>
          <tbody id="cat-rows">
            <tr
              v-for="row in items"
              :key="row.id"
              class="click"
              :class="{ archived: !!row.archivedAt }"
              @click="onRowClick(row)"
            >
              <td class="cell-item">
                <span class="lead">{{ row.name }}</span>
                <span v-if="row.description" class="sub">{{ row.description }}</span>
              </td>
              <td class="mono col-sku" style="font-size:12px">{{ row.sku ?? '—' }}</td>
              <td class="col-cat">{{ row.categoryName ?? '—' }}</td>
              <td class="col-type">
                <span :class="catalogTypePill(row.itemType)">{{ catalogTypeLabel(row.itemType) }}</span>
              </td>
              <td class="num col-price">
                {{ catalogPriceDisplay(row.defaultPrice, row.uom, row.itemType) }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="listError" id="cat-rows-empty" class="empty" style="display:block;">
          Could not load catalog items. Refresh and try again.
        </div>
        <div v-else-if="pending" id="cat-rows-empty" class="empty" style="display:block;">
          Loading catalog…
        </div>
        <div v-else id="cat-rows-empty" class="empty" style="display:block;">
          <template v-if="filtersDirty">No catalog items match your search.</template>
          <template v-else-if="canManage">No catalog items yet — create one with <b>+ New Item</b>, or import from Control Panel.</template>
          <template v-else>No catalog items yet.</template>
        </div>
      </div>

      <div class="cfoot">
        <span>{{ rangeLabel }}</span>
        <div v-if="pageCount > 1" class="pager">
          <button aria-label="Previous page" :disabled="page <= 1" @click="page--">‹</button>
          <button
            v-for="p in pageCount"
            :key="p"
            :class="{ on: p === page }"
            @click="page = p"
          >
            {{ p }}
          </button>
          <button aria-label="Next page" :disabled="page >= pageCount" @click="page++">›</button>
        </div>
      </div>
    </div>

    <CatalogCategoriesModal v-model:open="categoriesOpen" @changed="onCategoriesChanged" />

    <div
      id="cat-item-scrim"
      class="modal-scrim"
      :class="{ open: itemModalOpen }"
      :aria-hidden="!itemModalOpen"
      @click="onItemScrimClick"
    >
      <div class="modal" role="dialog" aria-labelledby="cat-item-title" aria-modal="true" @click.stop>
        <div class="mhead">
          <div>
            <h3 id="cat-item-title">{{ editingId ? 'Edit catalog item' : 'New catalog item' }}</h3>
            <p>Used when adding lines to invoices and service logs</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeItemModal">✕</button>
        </div>
        <CatalogItemForm
          v-model="form"
          :busy="formBusy"
          :error="formError"
          :categories="categories"
          :editing="!!editingId"
          :submit-label="formBusy ? (editingId ? 'Saving…' : 'Creating…') : (editingId ? 'Save changes' : 'Create item')"
          @submit="submitItem"
          @cancel="closeItemModal"
          @archive="archiveItem"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
tr.archived .lead {
  opacity: 0.65;
}
</style>
