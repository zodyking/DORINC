<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'
import type { ServiceLogSheetDocument, ServiceLogSheetSection } from '#shared/service-log-sheet-default'
import { sectionsByColumn } from '#shared/service-log-sheet-layout'
import {
  sheetGenerationFitSummary,
  type SheetDemandCandidate,
} from '#shared/service-log-sheet-generate'

interface FitSummary {
  rows: number
  capacity: number
  targetCapacity: number
  overflows: boolean
  qrVoidRows: number
  qrFits: boolean
  leftWeight: number
  rightWeight: number
}

interface GenerateProposal {
  document: ServiceLogSheetDocument
  candidates: SheetDemandCandidate[]
  fit: FitSummary
  steps: Array<{ step: string, detail: string }>
  usedAi: boolean
}

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  apply: [document: ServiceLogSheetDocument]
}>()

const loading = ref(false)
const error = ref('')
const proposal = ref<GenerateProposal | null>(null)

const leftSections = computed(() =>
  proposal.value ? sectionsByColumn(proposal.value.document).left : [],
)
const rightSections = computed(() =>
  proposal.value ? sectionsByColumn(proposal.value.document).right : [],
)

const lineCount = computed(() =>
  (proposal.value?.document.sections ?? []).reduce((n, s) => n + s.items.length, 0),
)

const liveFit = computed(() =>
  proposal.value ? sheetGenerationFitSummary(proposal.value.document) : null,
)

function close() {
  open.value = false
  error.value = ''
}

async function runGenerate() {
  loading.value = true
  error.value = ''
  proposal.value = null
  try {
    proposal.value = await $fetch<GenerateProposal>('/api/service-logs/sheet/generate', {
      method: 'POST',
    })
  }
  catch (err) {
    error.value = syncFetchErrorMessage(err, 'Could not generate sheet from catalog demand')
  }
  finally {
    loading.value = false
  }
}

function rejectProposal() {
  proposal.value = null
  close()
}

function applyProposal() {
  if (!proposal.value) return
  emit('apply', structuredClone(proposal.value.document))
  close()
}

function removeSection(sectionId: string) {
  if (!proposal.value) return
  proposal.value.document.sections = proposal.value.document.sections
    .filter(s => s.id !== sectionId)
}

function removeItem(sectionId: string, itemId: string) {
  if (!proposal.value) return
  const section = proposal.value.document.sections.find(s => s.id === sectionId)
  if (!section) return
  section.items = section.items.filter(i => i.id !== itemId)
  if (!section.items.length) {
    proposal.value.document.sections = proposal.value.document.sections
      .filter(s => s.id !== sectionId)
  }
}

function renameSection(section: ServiceLogSheetSection, title: string) {
  section.title = title
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'sl-gen-scrim') close()
}

watch(open, (isOpen) => {
  if (isOpen) void runGenerate()
})
</script>

<template>
  <div
    id="sl-gen-scrim"
    class="modal-scrim"
    :class="{ open }"
    :aria-hidden="!open"
    @click="onScrimClick"
  >
    <div
      class="modal gen-modal"
      role="dialog"
      aria-labelledby="sl-gen-title"
      aria-modal="true"
      @click.stop
    >
      <div class="mhead">
        <div>
          <h3 id="sl-gen-title">Generate from demand</h3>
          <p>
            Builds a dense Letter checklist from billed catalog demand, using
            classic shop sections (Cleaning, Lights, Filters, Brakes…).
            Review, edit, or reject before it replaces the template in the editor.
          </p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="close">✕</button>
      </div>

      <div class="mbody">
        <p v-if="error" class="err">{{ error }}</p>

        <div class="toolbar">
          <button type="button" class="btn sm" :disabled="loading" @click="runGenerate">
            {{ loading ? 'Generating…' : 'Regenerate' }}
          </button>
        </div>

        <div v-if="loading" class="empty" style="display:block;">
          Scoring invoice demand and packing classic shop sections…
        </div>

        <template v-else-if="proposal">
          <div class="fit-bar" :class="{ bad: liveFit && (liveFit.overflows || !liveFit.qrFits) }">
            <span>
              {{ lineCount }} services
              · {{ liveFit?.rows }} / {{ liveFit?.targetCapacity }} page rows
            </span>
            <span>
              QR void {{ liveFit?.qrVoidRows }}
              {{ liveFit?.qrFits ? '✓' : '(need 3+)' }}
            </span>
            <span>{{ proposal.usedAi ? 'Classic + AI polish' : 'Classic shop sections' }}</span>
          </div>

          <details class="steps">
            <summary>Generation steps ({{ proposal.steps.length }})</summary>
            <ol>
              <li v-for="(step, idx) in proposal.steps" :key="idx">
                <strong>{{ step.step }}</strong> — {{ step.detail }}
              </li>
            </ol>
          </details>

          <div class="cols">
            <section class="col">
              <h4>Left column</h4>
              <article v-for="sec in leftSections" :key="sec.id" class="sec">
                <div class="sec-head">
                  <input
                    :value="sec.title"
                    class="sec-title"
                    aria-label="Section title"
                    @input="renameSection(sec, ($event.target as HTMLInputElement).value)"
                  >
                  <button type="button" class="btn sm danger" @click="removeSection(sec.id)">
                    Remove
                  </button>
                </div>
                <ul>
                  <li v-for="item in sec.items" :key="item.id">
                    <span>
                      <strong>{{ item.name }}</strong>
                      <small>{{ item.price }}</small>
                    </span>
                    <button type="button" class="btn sm" @click="removeItem(sec.id, item.id)">✕</button>
                  </li>
                </ul>
              </article>
              <p v-if="!leftSections.length" class="help">No left sections</p>
            </section>

            <section class="col">
              <h4>Right column</h4>
              <article v-for="sec in rightSections" :key="sec.id" class="sec">
                <div class="sec-head">
                  <input
                    :value="sec.title"
                    class="sec-title"
                    aria-label="Section title"
                    @input="renameSection(sec, ($event.target as HTMLInputElement).value)"
                  >
                  <button type="button" class="btn sm danger" @click="removeSection(sec.id)">
                    Remove
                  </button>
                </div>
                <ul>
                  <li v-for="item in sec.items" :key="item.id">
                    <span>
                      <strong>{{ item.name }}</strong>
                      <small>{{ item.price }}</small>
                    </span>
                    <button type="button" class="btn sm" @click="removeItem(sec.id, item.id)">✕</button>
                  </li>
                </ul>
              </article>
              <p v-if="!rightSections.length" class="help">No right sections</p>
            </section>
          </div>
        </template>
      </div>

      <div class="mfoot">
        <button type="button" class="btn" :disabled="loading" @click="rejectProposal">Reject</button>
        <button
          type="button"
          class="btn primary"
          :disabled="loading || !proposal || !lineCount"
          @click="applyProposal"
        >
          Use in editor
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gen-modal {
  width: min(920px, 96vw);
  max-height: min(92vh, 860px);
  display: flex;
  flex-direction: column;
}
.gen-modal .mbody {
  overflow: auto;
  flex: 1;
}
.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}
.fit-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #ecfdf5;
  color: #047857;
  font-size: 12.5px;
  font-weight: 600;
}
.fit-bar.bad {
  background: #fffbeb;
  color: #b45309;
}
.steps {
  margin-bottom: 14px;
  font-size: 12.5px;
  color: #64748b;
}
.steps ol {
  margin: 8px 0 0;
  padding-left: 18px;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.col h4 {
  margin: 0 0 8px;
  font-size: 13px;
}
.sec {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  margin-bottom: 10px;
  background: #fff;
}
.sec-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.sec-title {
  flex: 1;
  font-weight: 700;
  font-size: 13.5px;
}
.sec ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sec li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-top: 1px solid #f1f5f9;
  font-size: 13px;
}
.sec li small {
  display: block;
  color: #64748b;
  font-size: 12px;
}
.btn.danger {
  color: #dc2626;
  border-color: #fecaca;
}
.err {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  color: #dc2626;
  font-size: 13px;
}
.help {
  color: #94a3b8;
  font-size: 12.5px;
}
@media (max-width: 720px) {
  .cols { grid-template-columns: 1fr; }
}
</style>
