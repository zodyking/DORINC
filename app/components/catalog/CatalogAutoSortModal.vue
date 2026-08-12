<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

export interface CategorySortProposalRow {
  itemId: string
  name: string
  description: string | null
  currentCategoryId: string | null
  currentCategoryName: string | null
  suggestedCategoryId: string
  suggestedCategoryName: string
  confidence: number
  selected?: boolean
}

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{ applied: [] }>()

const proposals = ref<CategorySortProposalRow[]>([])
const loading = ref(false)
const applying = ref(false)
const error = ref('')
const meta = ref<{ scanned: number, categorized: number } | null>(null)
const uncategorizedOnly = ref(true)

const selectedCount = computed(() => proposals.value.filter(p => p.selected).length)
const allSelected = computed(() =>
  proposals.value.length > 0 && proposals.value.every(p => p.selected),
)

function close() {
  open.value = false
  error.value = ''
}

function confidenceLabel(value: number) {
  const pct = Math.round(value * 100)
  if (pct >= 70) return 'High'
  if (pct >= 40) return 'Medium'
  return 'Low'
}

function toggleAll(checked: boolean) {
  proposals.value = proposals.value.map(p => ({ ...p, selected: checked }))
}

async function runPropose() {
  loading.value = true
  error.value = ''
  proposals.value = []
  meta.value = null
  try {
    const result = await $fetch<{
      proposals: CategorySortProposalRow[]
      scanned: number
      categorized: number
    }>('/api/catalog/ai/auto-sort', {
      method: 'POST',
      body: { uncategorizedOnly: uncategorizedOnly.value },
    })
    proposals.value = result.proposals.map(p => ({ ...p, selected: p.selected !== false }))
    meta.value = { scanned: result.scanned, categorized: result.categorized }
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not auto-sort catalog items')
  }
  finally {
    loading.value = false
  }
}

async function applySelected() {
  const assignments = proposals.value
    .filter(p => p.selected)
    .map(p => ({ itemId: p.itemId, categoryId: p.suggestedCategoryId }))
  if (!assignments.length) {
    error.value = 'Select at least one suggestion to apply'
    return
  }
  applying.value = true
  error.value = ''
  try {
    await $fetch('/api/catalog/ai/auto-sort/apply', {
      method: 'POST',
      body: { assignments },
    })
    emit('applied')
    close()
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not apply category assignments')
  }
  finally {
    applying.value = false
  }
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'cat-auto-sort-scrim') close()
}

watch(open, (isOpen) => {
  if (isOpen) runPropose()
})
</script>

<template>
  <div
    id="cat-auto-sort-scrim"
    class="modal-scrim"
    :class="{ open }"
    :aria-hidden="!open"
    @click="onScrimClick"
  >
    <div
      class="modal cat-ai-modal"
      role="dialog"
      aria-labelledby="cat-auto-sort-title"
      aria-modal="true"
      @click.stop
    >
      <div class="mhead">
        <div>
          <h3 id="cat-auto-sort-title">Auto-sort categories</h3>
          <p>Review suggested categories, then apply the ones you approve.</p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="close">✕</button>
      </div>

      <div class="mbody">
        <p v-if="error" class="err">{{ error }}</p>

        <div class="toolbar">
          <label class="chk">
            <input v-model="uncategorizedOnly" type="checkbox" :disabled="loading || applying">
            Uncategorized items only
          </label>
          <button type="button" class="btn sm" :disabled="loading || applying" @click="runPropose">
            {{ loading ? 'Scanning…' : 'Rescan' }}
          </button>
        </div>

        <p v-if="meta && !loading" class="meta">
          Scanned {{ meta.scanned }} item{{ meta.scanned === 1 ? '' : 's' }}
          · {{ meta.categorized }} suggestion{{ meta.categorized === 1 ? '' : 's' }}
        </p>

        <div v-if="loading" class="empty" style="display:block;">Scanning catalog…</div>

        <template v-else-if="proposals.length">
          <div class="list-head">
            <label class="chk">
              <input
                type="checkbox"
                :checked="allSelected"
                :disabled="applying"
                @change="toggleAll(($event.target as HTMLInputElement).checked)"
              >
              Select all ({{ selectedCount }}/{{ proposals.length }})
            </label>
          </div>
          <ul class="proposal-list">
            <li v-for="row in proposals" :key="row.itemId">
              <label class="chk row-chk">
                <input v-model="row.selected" type="checkbox" :disabled="applying">
              </label>
              <div class="row-main">
                <span class="lead">{{ row.name }}</span>
                <span v-if="row.description" class="sub">{{ row.description }}</span>
                <span class="path">
                  <span class="muted">{{ row.currentCategoryName ?? 'Uncategorized' }}</span>
                  <span aria-hidden="true"> → </span>
                  <strong>{{ row.suggestedCategoryName }}</strong>
                  <span class="conf">{{ confidenceLabel(row.confidence) }}</span>
                </span>
              </div>
            </li>
          </ul>
        </template>

        <div v-else class="empty" style="display:block;">
          No category suggestions — items may already be categorized, or keywords need tuning in Control Panel → Catalog Detection.
        </div>
      </div>

      <div class="mfoot">
        <button type="button" class="btn" :disabled="applying" @click="close">Cancel</button>
        <button
          type="button"
          class="btn primary"
          :disabled="applying || loading || !selectedCount"
          @click="applySelected"
        >
          {{ applying ? 'Applying…' : `Apply ${selectedCount}` }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cat-ai-modal {
  width: min(640px, 96vw);
  max-height: min(88vh, 720px);
  display: flex;
  flex-direction: column;
}
.cat-ai-modal .mbody {
  overflow: auto;
  flex: 1;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
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
.list-head {
  margin-bottom: 8px;
}
.proposal-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  max-height: 360px;
  overflow: auto;
}
.proposal-list li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
}
.proposal-list li:last-child { border-bottom: none; }
.row-chk { margin-top: 2px; }
.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lead {
  font-weight: 700;
  font-size: 13.5px;
  color: #0f172a;
}
.sub {
  font-size: 12px;
  color: #94a3b8;
}
.path {
  font-size: 12.5px;
  color: #334155;
  margin-top: 4px;
}
.muted { color: #94a3b8; }
.conf {
  margin-left: 8px;
  font-size: 11px;
  color: #64748b;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 999px;
}
.err {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 13px;
}
</style>
