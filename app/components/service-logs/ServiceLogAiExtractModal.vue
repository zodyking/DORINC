<script setup lang="ts">
interface AiSuggestionRow {
  id: string
  status: 'pending' | 'accepted' | 'edited' | 'rejected'
  featureType: string
  originalContent: Record<string, unknown> | null
  suggestedContent: Record<string, unknown>
  createdAt: string
}

interface ExtractionProgressPage {
  pageIndex: number
  fileId?: string
  pageType?: string | null
  status?: string
  message?: string
}

interface ExtractionProgress {
  phase?: string
  pageIndex?: number
  pageCount?: number
  pageType?: string | null
  message?: string
  pages?: ExtractionProgressPage[]
}

const props = defineProps<{
  open: boolean
  serviceLogId: string
  selectedFileId: string | null
  canExtract: boolean
}>()

const emit = defineEmits<{
  close: []
  refreshed: []
}>()

const { data: aiData, refresh: refreshAi } = useClientFetch<{ suggestions: AiSuggestionRow[] }>(
  () => `/api/service-logs/${props.serviceLogId}/ai-suggestions`,
)

const aiSuggestions = computed(() => aiData.value?.suggestions ?? [])

const pendingExtraction = computed(() => {
  const fileId = props.selectedFileId
  const pending = aiSuggestions.value.filter(s => s.status === 'pending' && s.featureType === 'service_log_extraction')
  if (!fileId) return pending[0] ?? null
  return pending.find((s) => {
    const fid = s.suggestedContent.fileId as string | undefined
    return !fid || fid === fileId
  }) ?? pending[0] ?? null
})

const extractBusy = ref(false)
const extractError = ref('')
const activeJobId = ref<string | null>(null)
const progress = ref<ExtractionProgress | null>(null)
const editComplaint = ref('')
const editInternal = ref('')
const editDraftJson = ref('')

watch(pendingExtraction, (s) => {
  if (!s) {
    editComplaint.value = ''
    editInternal.value = ''
    editDraftJson.value = ''
    return
  }
  const c = s.suggestedContent as { complaint?: string, internalNotes?: string, draftLineItems?: unknown[] }
  editComplaint.value = c.complaint ?? ''
  editInternal.value = c.internalNotes ?? ''
  editDraftJson.value = c.draftLineItems?.length
    ? JSON.stringify(c.draftLineItems, null, 2)
    : ''
}, { immediate: true })

let aiPollTimer: ReturnType<typeof setInterval> | null = null
let aiPollAttempts = 0
const AI_POLL_MAX = 90

const isRunning = computed(() => Boolean(activeJobId.value) && !pendingExtraction.value && !extractError.value)

function stopAiPoll() {
  if (aiPollTimer) {
    clearInterval(aiPollTimer)
    aiPollTimer = null
  }
  aiPollAttempts = 0
}

async function pollJobProgress() {
  if (!activeJobId.value) return
  try {
    const res = await $fetch<{ job: {
      status: string
      lastError?: string | null
      outputPayload?: { progress?: ExtractionProgress, suggestionId?: string } | null
    } }>(`/api/ai/jobs/${activeJobId.value}`)

    if (res.job.outputPayload?.progress) {
      progress.value = res.job.outputPayload.progress
    }

    if (res.job.status === 'failed') {
      extractError.value = res.job.lastError || 'AI extraction failed — enter details manually'
      activeJobId.value = null
      stopAiPoll()
      return
    }

    if (res.job.status === 'done') {
      await refreshAi()
      activeJobId.value = null
      stopAiPoll()
    }
  }
  catch {
    // Keep polling; suggestion refresh is the fallback.
  }
}

function startAiPoll() {
  stopAiPoll()
  aiPollTimer = setInterval(async () => {
    aiPollAttempts++
    await Promise.all([pollJobProgress(), refreshAi()])
    if (pendingExtraction.value) {
      activeJobId.value = null
      stopAiPoll()
    }
    else if (aiPollAttempts >= AI_POLL_MAX) {
      extractError.value = 'AI extraction timed out — enter details manually or try again'
      activeJobId.value = null
      stopAiPoll()
    }
  }, 1500)
}

onBeforeUnmount(() => stopAiPoll())

watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    stopAiPoll()
    extractError.value = ''
    activeJobId.value = null
    progress.value = null
  }
})

async function runExtraction() {
  if (!props.canExtract) return
  extractBusy.value = true
  extractError.value = ''
  progress.value = {
    phase: 'queued',
    message: 'Queuing extraction…',
    pageIndex: 0,
    pageCount: 0,
    pages: [],
  }
  try {
    const res = await $fetch<{ aiJob: { id: string } }>(`/api/service-logs/${props.serviceLogId}/ai-extract`, {
      method: 'POST',
      body: {},
    })
    activeJobId.value = res.aiJob.id
    startAiPoll()
    await pollJobProgress()
    await refreshAi()
  }
  catch (e: unknown) {
    extractError.value = (e as { data?: { message?: string } })?.data?.message ?? 'AI extraction failed — enter details manually'
    activeJobId.value = null
    progress.value = null
    stopAiPoll()
  }
  finally {
    extractBusy.value = false
  }
}

function buildExtractionContent() {
  let draftLineItems: unknown[] | undefined
  if (editDraftJson.value.trim()) {
    draftLineItems = JSON.parse(editDraftJson.value) as unknown[]
  }
  return {
    complaint: editComplaint.value || null,
    internalNotes: editInternal.value || null,
    draftLineItems,
    fileId: props.selectedFileId ?? undefined,
  }
}

async function reviewExtraction(action: 'accept' | 'edit' | 'reject') {
  const suggestion = pendingExtraction.value
  if (!suggestion) return
  extractBusy.value = true
  extractError.value = ''
  try {
    const body: Record<string, unknown> = { action }
    if (action === 'edit' || action === 'accept') {
      body.content = action === 'edit' ? buildExtractionContent() : suggestion.suggestedContent
    }
    await $fetch(`/api/ai/suggestions/${suggestion.id}/review`, { method: 'POST', body })
    await refreshAi()
    emit('refreshed')
    if (action !== 'reject') emit('close')
  }
  catch (e: unknown) {
    if (action === 'edit' && (e as Error).message?.includes('JSON')) {
      extractError.value = 'Draft line items must be valid JSON'
    }
    else {
      extractError.value = (e as { data?: { message?: string } })?.data?.message ?? 'Review failed'
    }
  }
  finally {
    extractBusy.value = false
  }
}

function pageTypeLabel(pageType?: string | null) {
  if (pageType === 'printed_form') return 'Printed form'
  if (pageType === 'handwritten') return 'Handwritten'
  return 'Detecting…'
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-backdrop"
      @click.self="emit('close')"
    >
      <div class="modal sl-ai-modal" role="dialog" aria-labelledby="sl-ai-modal-title" aria-modal="true">
        <div class="modal-header">
          <h2 id="sl-ai-modal-title">✦ AI extraction</h2>
          <button type="button" class="iconbtn" aria-label="Close" @click="emit('close')">✕</button>
        </div>
        <div class="modal-body">
          <p class="help" style="margin:0 0 12px;">
            Each page is classified (handwritten vs printed form), then line items are extracted. Accept, edit, or reject the merged result.
          </p>
          <p v-if="extractError" class="help" style="color:#dc2626; margin:0 0 12px;">{{ extractError }}</p>

          <div v-if="!pendingExtraction && isRunning" class="sl-ai-progress" aria-live="polite">
            <div class="sl-ai-progress__bar">
              <div
                class="sl-ai-progress__fill"
                :style="{
                  width: progress?.pageCount
                    ? `${Math.min(100, Math.round(((progress.pageIndex || 0) / progress.pageCount) * 100))}%`
                    : '18%',
                }"
              />
            </div>
            <p class="sl-ai-progress__msg">{{ progress?.message || 'Working…' }}</p>
            <ol v-if="progress?.pages?.length" class="sl-ai-progress__pages">
              <li
                v-for="page in progress.pages"
                :key="`${page.pageIndex}-${page.fileId || 'x'}`"
                :class="[`is-${page.status || 'queued'}`]"
              >
                <span class="sl-ai-progress__page-idx">Page {{ page.pageIndex }}</span>
                <span class="sl-ai-progress__page-type">{{ pageTypeLabel(page.pageType) }}</span>
                <span class="sl-ai-progress__page-status">{{ page.message || page.status }}</span>
              </li>
            </ol>
          </div>

          <div v-else-if="!pendingExtraction" class="sl-ai-modal__start">
            <button
              type="button"
              class="btn primary"
              :disabled="extractBusy || !canExtract"
              @click="runExtraction"
            >
              {{ extractBusy ? 'Starting…' : 'Extract from photos' }}
            </button>
          </div>

          <div v-else class="sl-review stack" style="gap:12px;">
            <div
              v-if="(pendingExtraction.suggestedContent.pageResults as ExtractionProgressPage[] | undefined)?.length"
              class="sl-ai-page-summary"
            >
              <span
                v-for="page in (pendingExtraction.suggestedContent.pageResults as ExtractionProgressPage[])"
                :key="page.pageIndex"
                class="sl-ai-page-chip"
              >
                Page {{ page.pageIndex }} · {{ pageTypeLabel(page.pageType) }}
              </span>
            </div>
            <div class="r stack">
              <span class="k">Suggested complaint</span>
              <textarea v-model="editComplaint" rows="2" class="sl-ai-field" />
            </div>
            <div class="r stack">
              <span class="k">Suggested internal notes</span>
              <textarea v-model="editInternal" rows="2" class="sl-ai-field" />
            </div>
            <div class="r stack">
              <span class="k">Draft lines (JSON)</span>
              <textarea v-model="editDraftJson" rows="3" class="sl-ai-field mono" placeholder="[]" />
            </div>
            <div class="sl-ai-acts">
              <button type="button" class="btn sm primary" :disabled="extractBusy" @click="reviewExtraction('accept')">
                Accept
              </button>
              <button type="button" class="btn sm" :disabled="extractBusy" @click="reviewExtraction('edit')">
                Accept with edits
              </button>
              <button type="button" class="btn sm" :disabled="extractBusy" @click="reviewExtraction('reject')">
                Reject
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(15, 23, 42, 0.45);
  display: grid;
  place-items: center;
  padding: 16px;
}

.modal {
  width: min(560px, 100%);
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 16px;
}

.modal-body {
  padding: 16px 18px 20px;
}

.sl-ai-modal__start {
  display: flex;
  justify-content: flex-start;
}

.sl-ai-field {
  width: 100%;
  font: inherit;
  font-size: 16px;
  padding: 8px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  resize: vertical;
  color: #334155;
}

.sl-ai-field.mono { font-family: "IBM Plex Mono", monospace; }

.sl-ai-acts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sl-ai-progress {
  display: grid;
  gap: 12px;
}

.sl-ai-progress__bar {
  height: 8px;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.sl-ai-progress__fill {
  height: 100%;
  min-width: 12%;
  background: linear-gradient(90deg, #0f766e, #14b8a6);
  transition: width 0.35s ease;
  animation: sl-ai-pulse 1.4s ease-in-out infinite;
}

.sl-ai-progress__msg {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
  font-weight: 600;
}

.sl-ai-progress__pages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.sl-ai-progress__pages li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 10px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}

.sl-ai-progress__pages li.is-done {
  border-color: #99f6e4;
  background: #f0fdfa;
}

.sl-ai-progress__pages li.is-classifying,
.sl-ai-progress__pages li.is-extracting {
  border-color: #99f6e4;
  box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.12);
}

.sl-ai-progress__page-idx {
  font-size: 12px;
  font-weight: 800;
  color: #0f766e;
}

.sl-ai-progress__page-type {
  font-size: 12px;
  font-weight: 700;
  color: #334155;
  justify-self: end;
}

.sl-ai-progress__page-status {
  grid-column: 1 / -1;
  font-size: 13px;
  color: #475569;
}

.sl-ai-page-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.sl-ai-page-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #ecfeff;
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
}

@keyframes sl-ai-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.72; }
}

@media (prefers-reduced-motion: reduce) {
  .sl-ai-progress__fill { animation: none; }
}
</style>
