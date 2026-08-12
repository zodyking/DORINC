<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import type { CatalogItemType } from '~/utils/catalog-ui'
import { catalogTypeLabel, catalogTypePill } from '~/utils/catalog-ui'
import { formatMoneyForDisplay } from '#shared/money'

export interface MinedCandidateRow {
  matchKey: string
  name: string
  sampleDescription: string
  occurrenceCount: number
  suggestedItemType: CatalogItemType
  suggestedCategoryId: string | null
  suggestedCategoryName: string | null
  suggestedPrice: string | null
  selected?: boolean
}

interface CategoryOption {
  id: string
  name: string
}

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  categories: CategoryOption[]
}>()

const emit = defineEmits<{ applied: [] }>()

const candidates = ref<MinedCandidateRow[]>([])
const loading = ref(false)
const applying = ref(false)
const error = ref('')
const meta = ref<{
  scannedLines: number
  minOccurrences: number
  totalMatched: number
  limit: number
} | null>(null)
const minOccurrences = ref(2)
const resultLimit = ref(200)

const selectedCount = computed(() => candidates.value.filter(c => c.selected).length)
const allSelected = computed(() =>
  candidates.value.length > 0 && candidates.value.every(c => c.selected),
)

function close() {
  open.value = false
  error.value = ''
}

function toggleAll(checked: boolean) {
  candidates.value = candidates.value.map(c => ({ ...c, selected: checked }))
}

function priceLabel(value: string | null | undefined) {
  if (!value?.trim()) return '—'
  return formatMoneyForDisplay(value) ?? '—'
}

async function runMine() {
  loading.value = true
  error.value = ''
  candidates.value = []
  meta.value = null
  try {
    const result = await $fetch<{
      candidates: MinedCandidateRow[]
      scannedLines: number
      minOccurrences: number
      totalMatched: number
      limit: number
    }>('/api/catalog/ai/mine-invoices', {
      method: 'POST',
      body: {
        minOccurrences: minOccurrences.value,
        limit: resultLimit.value,
        unlinkedOnly: true,
      },
    })
    candidates.value = result.candidates.map(c => ({
      ...c,
      suggestedPrice: c.suggestedPrice ?? '',
      selected: c.selected !== false,
    }))
    meta.value = {
      scannedLines: result.scannedLines,
      minOccurrences: result.minOccurrences,
      totalMatched: result.totalMatched,
      limit: result.limit,
    }
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not scan invoices for billed items')
  }
  finally {
    loading.value = false
  }
}

async function addSelected() {
  const items = candidates.value
    .filter(c => c.selected)
    .map(c => ({
      name: c.name.trim(),
      itemType: c.suggestedItemType,
      description: c.sampleDescription !== c.name ? c.sampleDescription : null,
      categoryId: c.suggestedCategoryId,
      defaultPrice: c.suggestedPrice?.trim() || null,
    }))
  if (!items.length) {
    error.value = 'Select at least one item to add'
    return
  }
  if (items.some(i => !i.name)) {
    error.value = 'Every selected item needs a name'
    return
  }

  applying.value = true
  error.value = ''
  try {
    await $fetch('/api/catalog/ai/mine-invoices/apply', {
      method: 'POST',
      body: { items },
    })
    emit('applied')
    close()
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not add items to catalog')
  }
  finally {
    applying.value = false
  }
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'cat-mine-scrim') close()
}

function onTypeChange(row: MinedCandidateRow, value: string) {
  if (value === 'part' || value === 'labor' || value === 'fee') {
    row.suggestedItemType = value
  }
}

function onCategoryChange(row: MinedCandidateRow, value: string) {
  row.suggestedCategoryId = value || null
  row.suggestedCategoryName = props.categories.find(c => c.id === value)?.name ?? null
}

watch(open, (isOpen) => {
  if (isOpen) runMine()
})
</script>

<template>
  <div
    id="cat-mine-scrim"
    class="modal-scrim"
    :class="{ open }"
    :aria-hidden="!open"
    @click="onScrimClick"
  >
    <div
      class="modal cat-ai-modal"
      role="dialog"
      aria-labelledby="cat-mine-title"
      aria-modal="true"
      @click.stop
    >
      <div class="mhead">
        <div>
          <h3 id="cat-mine-title">Find billed items</h3>
          <p>
            Common invoice lines not yet in the catalog. Side marks like R/S and L/S are stripped before matching.
          </p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="close">✕</button>
      </div>

      <div class="mbody">
        <p v-if="error" class="err">{{ error }}</p>

        <div class="toolbar">
          <label class="fld min-fld">
            Min times billed
            <select v-model.number="minOccurrences" :disabled="loading || applying" aria-label="Minimum occurrences">
              <option :value="2">2+</option>
              <option :value="3">3+</option>
              <option :value="5">5+</option>
              <option :value="10">10+</option>
            </select>
          </label>
          <label class="fld min-fld">
            Show up to
            <select v-model.number="resultLimit" :disabled="loading || applying" aria-label="Result limit">
              <option :value="100">100</option>
              <option :value="200">200</option>
              <option :value="350">350</option>
              <option :value="500">500</option>
            </select>
          </label>
          <button type="button" class="btn sm" :disabled="loading || applying" @click="runMine">
            {{ loading ? 'Scanning…' : 'Rescan' }}
          </button>
        </div>

        <p v-if="meta && !loading" class="meta">
          Scanned {{ meta.scannedLines }} invoice line{{ meta.scannedLines === 1 ? '' : 's' }}
          · {{ meta.totalMatched }} not already in catalog
          · showing {{ candidates.length }}{{ meta.totalMatched > candidates.length ? ` of ${meta.totalMatched}` : '' }}
          (billed {{ meta.minOccurrences }}+ times)
        </p>

        <div v-if="loading" class="empty" style="display:block;">Scanning invoices…</div>

        <template v-else-if="candidates.length">
          <div class="list-head">
            <label class="chk">
              <input
                type="checkbox"
                :checked="allSelected"
                :disabled="applying"
                @change="toggleAll(($event.target as HTMLInputElement).checked)"
              >
              Select all ({{ selectedCount }}/{{ candidates.length }})
            </label>
          </div>

          <ul class="candidate-list">
            <li v-for="row in candidates" :key="row.matchKey">
              <label class="chk row-chk">
                <input v-model="row.selected" type="checkbox" :disabled="applying">
              </label>
              <div class="row-main">
                <div class="row-top">
                  <input
                    v-model="row.name"
                    type="text"
                    class="name-input"
                    maxlength="200"
                    :disabled="applying"
                    aria-label="Catalog item name"
                  >
                  <span class="count">×{{ row.occurrenceCount }}</span>
                </div>
                <span v-if="row.sampleDescription !== row.name" class="sub">
                  Sample: {{ row.sampleDescription }}
                </span>
                <div class="row-fields">
                  <label class="fld">
                    Type
                    <select
                      :value="row.suggestedItemType"
                      :disabled="applying"
                      @change="onTypeChange(row, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="part">Part</option>
                      <option value="labor">Labor</option>
                      <option value="fee">Fee</option>
                    </select>
                  </label>
                  <label class="fld">
                    Category
                    <select
                      :value="row.suggestedCategoryId ?? ''"
                      :disabled="applying"
                      @change="onCategoryChange(row, ($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">Uncategorized</option>
                      <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
                    </select>
                  </label>
                  <label class="fld">
                    Price
                    <input
                      v-model="row.suggestedPrice"
                      type="text"
                      inputmode="decimal"
                      placeholder="0.00"
                      :disabled="applying"
                    >
                  </label>
                </div>
                <div class="row-badges">
                  <span :class="catalogTypePill(row.suggestedItemType)">
                    {{ catalogTypeLabel(row.suggestedItemType) }}
                  </span>
                  <span class="price-hint">{{ priceLabel(row.suggestedPrice) }}</span>
                </div>
              </div>
            </li>
          </ul>
        </template>

        <div v-else class="empty" style="display:block;">
          No commonly billed extras found. Try a lower minimum, or bill a few free-text lines that are not linked to catalog items.
        </div>
      </div>

      <div class="mfoot">
        <button type="button" class="btn" :disabled="applying" @click="close">Cancel</button>
        <button
          type="button"
          class="btn primary"
          :disabled="applying || loading || !selectedCount"
          @click="addSelected"
        >
          {{ applying ? 'Adding…' : `Add ${selectedCount} to catalog` }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cat-ai-modal {
  width: min(720px, 96vw);
  max-height: min(90vh, 780px);
  display: flex;
  flex-direction: column;
}
.cat-ai-modal .mbody {
  overflow: auto;
  flex: 1;
}
.toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.min-fld {
  margin: 0;
  min-width: 120px;
}
.toolbar .btn.sm {
  margin-left: auto;
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}
.meta {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: #64748b;
}
.list-head { margin-bottom: 8px; }
.candidate-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  max-height: 420px;
  overflow: auto;
}
.candidate-list li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-bottom: 1px solid #f1f5f9;
}
.candidate-list li:last-child { border-bottom: none; }
.row-chk { margin-top: 8px; }
.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row-top {
  display: flex;
  gap: 8px;
  align-items: center;
}
.name-input {
  flex: 1;
  min-width: 0;
  font-weight: 700;
  font-size: 13.5px;
}
.count {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: #475569;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 999px;
}
.sub {
  font-size: 12px;
  color: #94a3b8;
}
.row-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.row-fields .fld {
  margin: 0;
}
.row-badges {
  display: flex;
  gap: 8px;
  align-items: center;
}
.price-hint {
  font-size: 12px;
  color: #64748b;
}
.err {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 13px;
}
@media (max-width: 640px) {
  .row-fields {
    grid-template-columns: 1fr;
  }
}
</style>
