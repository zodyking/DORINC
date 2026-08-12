<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import type { CatalogItemType } from '~/utils/catalog-ui'
import { catalogTypeLabel, catalogTypePill } from '~/utils/catalog-ui'
import {
  catalogAuditFindingToFix,
  type CatalogAuditFinding,
  type CatalogAuditIssueKind,
} from '#shared/catalog-audit'

interface CategoryOption {
  id: string
  name: string
}

interface EditableFinding extends CatalogAuditFinding {
  editName: string
  editItemType: CatalogItemType | ''
  editCategoryId: string
  /** For duplicate groups: which peer ids to archive. */
  archiveIds: string[]
}

const open = defineModel<boolean>('open', { default: false })

defineProps<{
  categories: CategoryOption[]
}>()

const emit = defineEmits<{ applied: [] }>()

const findings = ref<EditableFinding[]>([])
const loading = ref(false)
const applying = ref(false)
const error = ref('')
const meta = ref<{
  scanned: number
  summary: { wording: number, type: number, uncategorized: number, duplicate: number }
} | null>(null)
const filterKind = ref<'all' | CatalogAuditIssueKind>('all')

const visibleFindings = computed(() => {
  if (filterKind.value === 'all') return findings.value
  return findings.value.filter(f => f.kinds.includes(filterKind.value))
})

const selectedCount = computed(() => findings.value.filter(f => f.selected).length)

function close() {
  open.value = false
  error.value = ''
}

function kindLabel(kind: CatalogAuditIssueKind) {
  switch (kind) {
    case 'wording': return 'Wording'
    case 'type': return 'Type'
    case 'uncategorized': return 'No category'
    case 'duplicate': return 'Duplicate'
  }
}

function kindPill(kind: CatalogAuditIssueKind) {
  switch (kind) {
    case 'wording': return 'pill info'
    case 'type': return 'pill warn'
    case 'uncategorized': return 'pill gray'
    case 'duplicate': return 'pill over'
  }
}

function toEditable(f: CatalogAuditFinding): EditableFinding {
  return {
    ...f,
    editName: f.suggestedName ?? f.name,
    editItemType: (f.suggestedItemType ?? f.currentItemType) as CatalogItemType,
    editCategoryId: f.suggestedCategoryId ?? f.currentCategoryId ?? '',
    archiveIds: f.kinds.includes('duplicate') ? f.duplicates.map(d => d.itemId) : [],
    selected: f.selected,
  }
}

async function runAudit() {
  loading.value = true
  error.value = ''
  findings.value = []
  meta.value = null
  try {
    const result = await $fetch<{
      findings: CatalogAuditFinding[]
      scanned: number
      summary: { wording: number, type: number, uncategorized: number, duplicate: number }
    }>('/api/catalog/ai/audit', { method: 'POST' })
    findings.value = result.findings.map(toEditable)
    meta.value = { scanned: result.scanned, summary: result.summary }
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not audit catalog')
  }
  finally {
    loading.value = false
  }
}

function toggleArchivePeer(row: EditableFinding, peerId: string, checked: boolean) {
  if (checked) {
    if (!row.archiveIds.includes(peerId)) row.archiveIds = [...row.archiveIds, peerId]
  }
  else {
    row.archiveIds = row.archiveIds.filter(id => id !== peerId)
  }
  row.selected = row.archiveIds.length > 0
}

async function applySelected() {
  const selected = findings.value.filter(f => f.selected)
  if (!selected.length) {
    error.value = 'Select at least one finding to apply'
    return
  }

  const fixes = []
  const duplicates = []

  for (const row of selected) {
    if (row.kinds.includes('duplicate') && row.duplicates.length) {
      if (!row.archiveIds.length) continue
      duplicates.push({
        keepItemId: row.itemId,
        archiveItemIds: row.archiveIds,
      })
      continue
    }

    const fix = catalogAuditFindingToFix(row, {
      name: row.editName.trim(),
      itemType: row.editItemType || undefined,
      categoryId: row.editCategoryId || null,
      description: row.suggestedDescription,
      uom: row.suggestedUom ?? undefined,
    })
    if (fix) fixes.push(fix)
  }

  if (!fixes.length && !duplicates.length) {
    error.value = 'Nothing to apply — adjust selections or suggested values'
    return
  }

  applying.value = true
  error.value = ''
  try {
    await $fetch('/api/catalog/ai/audit/apply', {
      method: 'POST',
      body: { fixes, duplicates },
    })
    emit('applied')
    close()
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not apply catalog audit fixes')
  }
  finally {
    applying.value = false
  }
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'cat-audit-scrim') close()
}

watch(open, (isOpen) => {
  if (isOpen) runAudit()
})
</script>

<template>
  <div
    id="cat-audit-scrim"
    class="modal-scrim"
    :class="{ open }"
    :aria-hidden="!open"
    @click="onScrimClick"
  >
    <div
      class="modal cat-ai-modal"
      role="dialog"
      aria-labelledby="cat-audit-title"
      aria-modal="true"
      @click.stop
    >
      <div class="mhead">
        <div>
          <h3 id="cat-audit-title">Audit catalog</h3>
          <p>
            Review wording, wrong part/labor types, missing categories, and duplicates.
            Auto-fixes are pre-selected — adjust anything before applying.
          </p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="close">✕</button>
      </div>

      <div class="mbody">
        <p v-if="error" class="err">{{ error }}</p>

        <div class="toolbar">
          <label class="fld min-fld">
            Show
            <select v-model="filterKind" :disabled="loading || applying" aria-label="Filter findings">
              <option value="all">All findings</option>
              <option value="type">Type mistakes</option>
              <option value="wording">Wording</option>
              <option value="uncategorized">No category</option>
              <option value="duplicate">Duplicates</option>
            </select>
          </label>
          <button type="button" class="btn sm" :disabled="loading || applying" @click="runAudit">
            {{ loading ? 'Auditing…' : 'Rescan' }}
          </button>
        </div>

        <p v-if="meta && !loading" class="meta">
          Scanned {{ meta.scanned }} item{{ meta.scanned === 1 ? '' : 's' }}
          · type {{ meta.summary.type }}
          · wording {{ meta.summary.wording }}
          · uncategorized {{ meta.summary.uncategorized }}
          · duplicates {{ meta.summary.duplicate }}
        </p>

        <div v-if="loading" class="empty" style="display:block;">Auditing catalog…</div>

        <template v-else-if="visibleFindings.length">
          <ul class="finding-list">
            <li v-for="row in visibleFindings" :key="row.id" class="finding">
              <label class="chk row-chk">
                <input v-model="row.selected" type="checkbox" :disabled="applying">
              </label>

              <div class="row-main">
                <div class="row-top">
                  <div class="kind-pills">
                    <span v-for="kind in row.kinds" :key="kind" :class="kindPill(kind)">
                      {{ kindLabel(kind) }}
                    </span>
                  </div>
                  <span v-if="row.autoFixable" class="auto-tag">Auto-fix</span>
                  <span v-else class="manual-tag">Manual</span>
                </div>

                <!-- Duplicate group -->
                <template v-if="row.kinds.includes('duplicate') && row.duplicates.length">
                  <p class="lead">Keep “{{ row.name }}”</p>
                  <p class="sub">Archive selected duplicates:</p>
                  <ul class="dup-list">
                    <li v-for="peer in row.duplicates" :key="peer.itemId">
                      <label class="chk">
                        <input
                          type="checkbox"
                          :checked="row.archiveIds.includes(peer.itemId)"
                          :disabled="applying"
                          @change="toggleArchivePeer(row, peer.itemId, ($event.target as HTMLInputElement).checked)"
                        >
                        <span>
                          {{ peer.name }}
                          <span :class="catalogTypePill(peer.itemType)" class="mini-pill">
                            {{ catalogTypeLabel(peer.itemType) }}
                          </span>
                        </span>
                      </label>
                    </li>
                  </ul>
                </template>

                <!-- Item fixes -->
                <template v-else>
                  <div v-if="row.kinds.includes('wording') || row.suggestedName" class="compare">
                    <div class="col">
                      <span class="col-label">Current name</span>
                      <span class="col-val">{{ row.name }}</span>
                    </div>
                    <div class="arrow" aria-hidden="true">→</div>
                    <div class="col">
                      <span class="col-label">Suggested name</span>
                      <input
                        v-model="row.editName"
                        type="text"
                        class="name-input"
                        maxlength="200"
                        :disabled="applying"
                        aria-label="Suggested catalog name"
                      >
                    </div>
                  </div>

                  <p v-else class="lead">{{ row.name }}</p>

                  <p v-if="row.suggestedDescription" class="sub">
                    Note: {{ row.description }} → {{ row.suggestedDescription }}
                  </p>

                  <div class="row-fields">
                    <label v-if="row.kinds.includes('type') || row.suggestedItemType" class="fld">
                      Type
                      <select v-model="row.editItemType" :disabled="applying">
                        <option value="part">Part</option>
                        <option value="labor">Labor</option>
                        <option value="fee">Fee</option>
                      </select>
                      <span class="hint">
                        Was {{ catalogTypeLabel(row.currentItemType) }}
                      </span>
                    </label>

                    <label
                      v-if="row.kinds.includes('uncategorized') || row.suggestedCategoryId"
                      class="fld"
                    >
                      Category
                      <select v-model="row.editCategoryId" :disabled="applying">
                        <option value="">Uncategorized</option>
                        <option v-for="c in categories" :key="c.id" :value="c.id">
                          {{ c.name }}
                        </option>
                      </select>
                      <span class="hint">Was {{ row.currentCategoryName ?? 'none' }}</span>
                    </label>
                  </div>
                </template>
              </div>
            </li>
          </ul>
        </template>

        <div v-else class="empty" style="display:block;">
          No catalog issues found{{ filterKind !== 'all' ? ' for this filter' : '' }}.
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
  width: min(760px, 96vw);
  max-height: min(90vh, 820px);
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
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.min-fld {
  margin: 0;
  min-width: 160px;
}
.toolbar .btn.sm { margin-left: auto; }
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
.finding-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  max-height: 460px;
  overflow: auto;
}
.finding {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px;
  border-bottom: 1px solid #f1f5f9;
}
.finding:last-child { border-bottom: none; }
.row-chk { margin-top: 4px; }
.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.row-top {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.kind-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.auto-tag, .manual-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;
}
.auto-tag {
  color: #047857;
  background: #ecfdf5;
}
.manual-tag {
  color: #92400e;
  background: #fffbeb;
}
.lead {
  margin: 0;
  font-weight: 700;
  font-size: 13.5px;
  color: #0f172a;
}
.sub {
  margin: 0;
  font-size: 12px;
  color: #94a3b8;
}
.compare {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: start;
}
.col-label {
  display: block;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 2px;
}
.col-val {
  font-size: 13px;
  color: #64748b;
}
.arrow {
  padding-top: 18px;
  color: #94a3b8;
}
.name-input {
  width: 100%;
  font-weight: 700;
  font-size: 13.5px;
}
.row-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.row-fields .fld { margin: 0; }
.hint {
  display: block;
  margin-top: 4px;
  font-size: 11.5px;
  color: #94a3b8;
}
.dup-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #f1f5f9;
  border-radius: 8px;
}
.dup-list li {
  padding: 8px 10px;
  border-bottom: 1px solid #f8fafc;
}
.dup-list li:last-child { border-bottom: none; }
.mini-pill {
  margin-left: 6px;
  font-size: 11px;
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
  .compare { grid-template-columns: 1fr; }
  .arrow { display: none; }
  .row-fields { grid-template-columns: 1fr; }
}
</style>
