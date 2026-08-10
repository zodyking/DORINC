<script setup lang="ts">
import { expandPackageItemToLineFields, type PackageLineItem } from '~/utils/invoice-editor-ui'

export interface PackageSummary {
  id: string
  name: string
  sku: string | null
  description: string | null
  itemCount: number
}

const emit = defineEmits<{
  applied: [lines: ReturnType<typeof expandPackageItemToLineFields>[]]
}>()

withDefaults(defineProps<{
  disabled?: boolean
  /** Hide the built-in trigger when opening from a parent menu/button. */
  hideTrigger?: boolean
}>(), {
  disabled: false,
  hideTrigger: false,
})

const open = ref(false)
const q = ref('')
const busy = ref(false)
const error = ref('')
const packages = ref<PackageSummary[]>([])
const applyingId = ref<string | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(q, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { void loadPackages() }, 200)
})

async function loadPackages() {
  busy.value = true
  error.value = ''
  try {
    const data = await $fetch<{ items: PackageSummary[] }>('/api/catalog/packages', {
      query: { q: q.value || undefined, pageSize: 20, sort: 'name-asc' },
    })
    packages.value = data.items
  }
  catch {
    error.value = 'Could not load packages'
    packages.value = []
  }
  finally {
    busy.value = false
  }
}

function showModal() {
  open.value = true
  q.value = ''
  error.value = ''
  void loadPackages()
}

function closeModal() {
  if (applyingId.value) return
  open.value = false
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'add-pkg-scrim') closeModal()
}

async function applyPackage(row: PackageSummary) {
  applyingId.value = row.id
  error.value = ''
  try {
    const { package: pkg } = await $fetch<{ package: { items: PackageLineItem[] } }>(`/api/catalog/packages/${row.id}`)
    if (!pkg.items.length) {
      error.value = 'This package has no items'
      return
    }
    const lines = pkg.items.map(item => expandPackageItemToLineFields(item))
    emit('applied', lines)
    open.value = false
  }
  catch {
    error.value = 'Could not load package items'
  }
  finally {
    applyingId.value = null
  }
}

defineExpose({ showModal })
</script>

<template>
  <div class="add-pkg">
    <button
      v-if="!hideTrigger"
      type="button"
      class="btn sm add-pkg-trigger"
      :disabled="disabled"
      @click="showModal"
    >
      + Add Package
    </button>

    <div
      id="add-pkg-scrim"
      class="modal-scrim"
      :class="{ open }"
      :aria-hidden="!open"
      @click="onScrimClick"
    >
      <div class="modal" role="dialog" aria-labelledby="add-pkg-title" aria-modal="true" @click.stop>
        <div class="mhead">
          <div>
            <h3 id="add-pkg-title">Add package</h3>
            <p>Insert all items from a catalog package as invoice lines</p>
          </div>
          <button type="button" class="close" aria-label="Close" :disabled="!!applyingId" @click="closeModal">✕</button>
        </div>
        <div class="mbody">
          <label class="fld">
            <span>Search packages</span>
            <input v-model="q" type="search" placeholder="Package name or SKU…" autofocus>
          </label>
          <p v-if="error" class="help" style="color:#dc2626; margin:0 0 12px;">{{ error }}</p>
          <p v-if="busy && !packages.length" class="help" style="margin:0;">Loading packages…</p>
          <div v-else-if="packages.length" class="add-pkg-list">
            <button
              v-for="row in packages"
              :key="row.id"
              type="button"
              class="add-pkg-row"
              :disabled="!!applyingId"
              @click="applyPackage(row)"
            >
              <span class="lead">{{ row.name }}</span>
              <span class="sub">
                {{ row.itemCount }} item{{ row.itemCount === 1 ? '' : 's' }}
                <template v-if="row.sku"> · {{ row.sku }}</template>
              </span>
              <span v-if="applyingId === row.id" class="sub">Adding…</span>
            </button>
          </div>
          <p v-else class="help" style="margin:0;">No packages found. Create packages on the Catalog page.</p>
        </div>
        <div class="mfoot">
          <button type="button" class="btn" :disabled="!!applyingId" @click="closeModal">Cancel</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add-pkg-trigger {
  white-space: nowrap;
  flex: none;
}

.add-pkg-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow: auto;
}

.add-pkg-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 10px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.add-pkg-row:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.add-pkg-row:disabled {
  opacity: 0.7;
  cursor: wait;
}

.add-pkg-row .lead {
  font-weight: 600;
}
</style>
