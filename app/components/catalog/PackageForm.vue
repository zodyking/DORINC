<script setup lang="ts">
import { catalogTypeLabel, catalogTypePill } from '~/utils/catalog-ui'
import type { CatalogQuickItem } from '~/utils/invoice-editor-ui'

export interface PackageFormValue {
  sku: string
  name: string
  description: string
  categoryId: string
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

const model = defineModel<PackageFormValue>({ required: true })
const lines = defineModel<PackageLineDraft[]>('lines', { required: true })

const props = defineProps<{
  busy?: boolean
  submitLabel: string
  error?: string
  categories: { id: string, name: string }[]
  editing?: boolean
}>()

const emit = defineEmits<{ submit: [], cancel: [], archive: [] }>()

const searchQ = ref('')
const searchOpen = ref(false)
const searchBusy = ref(false)
const searchResults = ref<CatalogQuickItem[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null

function newLocalId() {
  return `pkg-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

watch(searchQ, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!q.trim()) {
    searchResults.value = []
    searchOpen.value = false
    return
  }
  searchTimer = setTimeout(() => { void runSearch(q.trim()) }, 220)
})

async function runSearch(q: string) {
  searchBusy.value = true
  searchOpen.value = true
  try {
    const data = await $fetch<{ items: CatalogQuickItem[] }>('/api/catalog/items', {
      query: { q, pageSize: 12 },
    })
    searchResults.value = data.items.map(item => ({
      id: item.id,
      itemType: item.itemType,
      sku: item.sku,
      name: item.name,
      defaultPrice: item.defaultPrice,
      uom: item.uom,
    }))
  }
  catch {
    searchResults.value = []
  }
  finally {
    searchBusy.value = false
  }
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
  searchOpen.value = false
}

function removeLine(localId: string) {
  lines.value = lines.value.filter(line => line.localId !== localId)
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

      <label class="fld">
        <span>Description</span>
        <textarea v-model="model.description" rows="2" maxlength="2000" placeholder="What this package includes" />
      </label>

      <label class="fld">
        <span>Category</span>
        <select v-model="model.categoryId">
          <option value="">Uncategorized</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
        </select>
      </label>

      <div class="pkg-lines">
        <div class="pkg-lines-head">
          <h4>Included items</h4>
          <div class="pkg-search-wrap">
            <input
              v-model="searchQ"
              type="search"
              placeholder="Search catalog to add items…"
              aria-label="Search catalog items to add to package"
              @focus="searchOpen = !!searchQ.trim()"
            >
            <div v-if="searchOpen" class="pkg-search-panel">
              <p v-if="searchBusy" class="help" style="margin:8px 12px;">Searching…</p>
              <p v-else-if="!searchResults.length" class="help" style="margin:8px 12px;">No catalog items found.</p>
              <button
                v-for="item in searchResults"
                :key="item.id"
                type="button"
                class="pkg-search-hit"
                @mousedown.prevent="addCatalogItem(item)"
              >
                <span :class="catalogTypePill(item.itemType)">{{ catalogTypeLabel(item.itemType) }}</span>
                <span>{{ item.name }}</span>
                <span v-if="item.sku" class="sub">{{ item.sku }}</span>
              </button>
            </div>
          </div>
        </div>

        <div v-if="lines.length" class="tscroll">
          <table class="tbl pkg-lines-tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th style="width:110px">Qty / Hrs</th>
                <th style="width:80px" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in lines" :key="line.localId">
                <td>
                  <span :class="catalogTypePill(line.itemType)" style="margin-right:8px">{{ catalogTypeLabel(line.itemType) }}</span>
                  {{ line.name }}
                  <span v-if="line.sku" class="sub">{{ line.sku }}</span>
                </td>
                <td>
                  <input v-model="line.quantity" type="text" inputmode="decimal" maxlength="30">
                </td>
                <td class="pkg-line-actions">
                  <button type="button" class="btn ghost sm" aria-label="Move up" @click="moveLine(line.localId, -1)">↑</button>
                  <button type="button" class="btn ghost sm" aria-label="Move down" @click="moveLine(line.localId, 1)">↓</button>
                  <button type="button" class="rm" aria-label="Remove item" @click="removeLine(line.localId)">✕</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="help" style="margin:12px 0 0;">Add catalog items above — each becomes a line when the package is applied to an invoice.</p>
      </div>
    </div>

    <div class="mfoot">
      <button v-if="editing" type="button" class="btn danger ghost" :disabled="busy" @click="emit('archive')">
        Archive package
      </button>
      <div class="right">
        <button type="button" class="btn" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="btn primary" :disabled="busy || !model.name.trim()">
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

.pkg-lines {
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--border, #e2e8f0);
}

.pkg-lines-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.pkg-lines-head h4 {
  margin: 0;
  font-size: 14px;
}

.pkg-search-wrap {
  position: relative;
  flex: 1 1 240px;
  max-width: 360px;
}

.pkg-search-panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 240px;
  overflow: auto;
  background: #fff;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
}

.pkg-search-hit {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.pkg-search-hit:hover {
  background: #f8fafc;
}

.pkg-line-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
</style>
