<script setup lang="ts">
interface AiSuggestionRow {
  id: string
  status: 'pending' | 'accepted' | 'edited' | 'rejected'
  featureType: string
  originalContent: Record<string, unknown> | null
  suggestedContent: Record<string, unknown>
  createdAt: string
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
const AI_POLL_MAX = 60

function stopAiPoll() {
  if (aiPollTimer) {
    clearInterval(aiPollTimer)
    aiPollTimer = null
  }
  aiPollAttempts = 0
}

function startAiPoll() {
  stopAiPoll()
  aiPollTimer = setInterval(async () => {
    aiPollAttempts++
    await refreshAi()
    if (pendingExtraction.value) {
      stopAiPoll()
    }
    else if (aiPollAttempts >= AI_POLL_MAX) {
      extractError.value = 'AI extraction timed out — enter details manually or try again'
      stopAiPoll()
    }
  }, 2000)
}

onBeforeUnmount(() => stopAiPoll())

watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    stopAiPoll()
    extractError.value = ''
  }
})

async function runExtraction() {
  if (!props.canExtract) return
  extractBusy.value = true
  extractError.value = ''
  try {
    await $fetch(`/api/service-logs/${props.serviceLogId}/ai-extract`, {
      method: 'POST',
      body: { fileId: props.selectedFileId ?? undefined },
    })
    startAiPoll()
    await refreshAi()
  }
  catch (e: unknown) {
    extractError.value = (e as { data?: { message?: string } })?.data?.message ?? 'AI extraction failed — enter details manually'
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
            Suggest fields from the selected photo — accept, edit, or reject. Manual entry always works if AI fails.
          </p>
          <p v-if="extractError" class="help" style="color:#dc2626; margin:0 0 12px;">{{ extractError }}</p>

          <div v-if="!pendingExtraction" class="sl-ai-modal__start">
            <button
              type="button"
              class="btn primary"
              :disabled="extractBusy || !selectedFileId"
              @click="runExtraction"
            >
              {{ extractBusy ? 'Running…' : 'Extract from image' }}
            </button>
          </div>

          <div v-else class="sl-review stack" style="gap:12px;">
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
  width: min(520px, 100%);
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
</style>
