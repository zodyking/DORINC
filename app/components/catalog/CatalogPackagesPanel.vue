<script setup lang="ts">
import PackageForm, { type PackageFormValue, type PackageLineDraft } from '~/components/catalog/PackageForm.vue'
import { windowedPagerPages } from '~/utils/pager-ui'

const auth = useAuthStore()
const canManage = computed(() => auth.can('catalog.manage.all'))

interface PackageRow {
  id: string
  sku: string | null
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  itemCount: number
  archivedAt: string | null
  createdAt: string
}

const q = ref('')
const fSort = ref<'name-asc' | 'name-desc' | 'sku-asc' | 'newest'>('name-asc')
const page = ref(1)
const PAGE_SIZE = 25

watch([q, fSort], () => { page.value = 1 })

const query = computed(() => ({
  page: page.value,
  pageSize: PAGE_SIZE,
  q: q.value || undefined,
  sort: fSort.value,
}))

const { data, refresh, pending, error: listError } = useClientFetch<{ items: PackageRow[], total: number }>(
  '/api/catalog/packages',
  { query },
)

const packages = computed(() => data.value?.items ?? [])
const total = computed(() => data.value?.total ?? 0)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const pagerPages = computed(() => windowedPagerPages(page.value, pageCount.value))
const filtersDirty = computed(() => !!q.value.trim() || fSort.value !== 'name-asc')

function clearFilters() {
  q.value = ''
  fSort.value = 'name-asc'
}

const listCountLabel = computed(() => {
  if (pending.value) return 'Loading…'
  if (!total.value) return 'No packages'
  const from = (page.value - 1) * PAGE_SIZE + 1
  const to = Math.min(page.value * PAGE_SIZE, total.value)
  return `Showing ${from}—${to} of ${total.value}`
})

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const formBusy = ref(false)
const formError = ref('')

const emptyForm = (): PackageFormValue => ({
  sku: '',
  name: '',
})

const form = reactive<PackageFormValue>(emptyForm())
const formLines = ref<PackageLineDraft[]>([])

function newLocalId() {
  return `pkg-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function openNewPackage() {
  if (!canManage.value) return
  editingId.value = null
  Object.assign(form, emptyForm())
  formLines.value = []
  formError.value = ''
  modalOpen.value = true
}

async function openEditPackage(row: PackageRow) {
  if (!canManage.value) return
  formBusy.value = true
  formError.value = ''
  try {
    const { package: pkg } = await $fetch<{ package: PackageRow & { items: PackageLineDraft[] } }>(`/api/catalog/packages/${row.id}`)
    editingId.value = pkg.id
    Object.assign(form, {
      sku: pkg.sku ?? '',
      name: pkg.name,
    })
    formLines.value = pkg.items.map(item => ({
      localId: newLocalId(),
      catalogItemId: item.catalogItemId,
      itemType: item.itemType,
      name: item.name,
      sku: item.sku,
      defaultPrice: item.defaultPrice,
      uom: item.uom,
      quantity: item.quantity,
    }))
    modalOpen.value = true
  }
  catch {
    formError.value = 'Could not load package'
  }
  finally {
    formBusy.value = false
  }
}

function closeModal() {
  modalOpen.value = false
  editingId.value = null
  formError.value = ''
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'pkg-modal-scrim') closeModal()
}

function headerPayload() {
  return {
    sku: form.sku || null,
    name: form.name,
    description: null,
    categoryId: null,
  }
}

function itemsPayload() {
  return formLines.value.map((line, index) => ({
    catalogItemId: line.catalogItemId,
    quantity: line.quantity || '1',
    sortOrder: index,
  }))
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { data?: { message?: string } })?.data
  return data?.message ?? fallback
}

async function submitPackage() {
  if (!form.name.trim()) {
    formError.value = 'Name is required'
    return
  }
  if (!formLines.value.length) {
    formError.value = 'Add at least one catalog item to the package'
    return
  }
  formBusy.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      await $fetch(`/api/catalog/packages/${editingId.value}`, {
        method: 'PATCH',
        body: headerPayload(),
      })
      await $fetch(`/api/catalog/packages/${editingId.value}/items`, {
        method: 'PUT',
        body: { items: itemsPayload() },
      })
    }
    else {
      await $fetch('/api/catalog/packages', {
        method: 'POST',
        body: { ...headerPayload(), items: itemsPayload() },
      })
    }
    closeModal()
    await refresh()
  }
  catch (err) {
    formError.value = apiErrorMessage(err, 'Could not save package')
  }
  finally {
    formBusy.value = false
  }
}

async function archivePackage() {
  if (!editingId.value) return
  if (!window.confirm('Archive this package? It will be hidden from invoice quick-add.')) return
  formBusy.value = true
  formError.value = ''
  try {
    await $fetch(`/api/catalog/packages/${editingId.value}/archive`, { method: 'POST' })
    closeModal()
    await refresh()
  }
  catch (err) {
    formError.value = apiErrorMessage(err, 'Could not archive package')
  }
  finally {
    formBusy.value = false
  }
}

function onRowClick(row: PackageRow) {
  if (canManage.value) void openEditPackage(row)
}

defineExpose({ refresh, openNewPackage })
</script>

<template>
  <div class="pkg-panel">
    <ListFilterBar
      v-model:search="q"
      search-placeholder="Search packages or SKUs…"
      search-aria-label="Search catalog packages"
      :count-label="listCountLabel"
      :filters-active="filtersDirty"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <label class="fld">
          Sort by
          <select v-model="fSort" aria-label="Sort catalog packages">
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
        <table v-if="packages.length" class="tbl cat-tbl">
          <thead>
            <tr>
              <th class="cell-item">Package</th>
              <th class="col-sku">SKU</th>
              <th class="col-type">Items</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in packages"
              :key="row.id"
              class="click"
              :class="{ archived: !!row.archivedAt }"
              @click="onRowClick(row)"
            >
              <td class="cell-item">
                <span class="lead">{{ row.name }}</span>
              </td>
              <td class="mono col-sku" style="font-size:12px">{{ row.sku ?? '—' }}</td>
              <td class="col-type">{{ row.itemCount }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="listError" class="empty" style="display:block;">
          Could not load packages. Refresh and try again.
        </div>
        <div v-else-if="pending" class="empty" style="display:block;">
          Loading packages…
        </div>
        <div v-else class="empty" style="display:block;">
          <template v-if="filtersDirty">No packages match your search.</template>
          <template v-else-if="canManage">No packages yet — create one with <b>+ New Package</b>.</template>
          <template v-else>No packages yet.</template>
        </div>
      </div>

      <div class="cfoot">
        <span>{{ listCountLabel }}</span>
        <div v-if="pageCount > 1" class="pager">
          <button aria-label="Previous page" :disabled="page <= 1" @click="page--">‹</button>
          <button
            v-for="p in pagerPages"
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

    <div
      id="pkg-modal-scrim"
      class="modal-scrim"
      :class="{ open: modalOpen }"
      :aria-hidden="!modalOpen"
      @click="onScrimClick"
    >
      <div class="modal modal--wide" role="dialog" aria-labelledby="pkg-modal-title" aria-modal="true" @click.stop>
        <div class="mhead">
          <div>
            <h3 id="pkg-modal-title">{{ editingId ? 'Edit package' : 'New package' }}</h3>
            <p>Group catalog items for quick invoice line entry</p>
          </div>
          <button type="button" class="close" aria-label="Close" @click="closeModal">✕</button>
        </div>
        <PackageForm
          :key="editingId ?? 'new'"
          v-model="form"
          v-model:lines="formLines"
          :busy="formBusy"
          :error="formError"
          :editing="!!editingId"
          :submit-label="formBusy ? (editingId ? 'Saving…' : 'Creating…') : (editingId ? 'Save changes' : 'Create package')"
          @submit="submitPackage"
          @cancel="closeModal"
          @archive="archivePackage"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
tr.archived .lead {
  opacity: 0.65;
}
</style>
