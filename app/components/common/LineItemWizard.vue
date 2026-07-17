<script setup lang="ts">
import {
  calcLineAmount,
  applyInferredLineType,
  emptyWizardLine,
  WIZARD_LINE_TYPES,
  type WizardLineDraft,
  type WizardLineType,
} from '~/utils/line-item-wizard-ui'
import { lineTypeLabel } from '~/utils/invoices-ui'
import { formatFieldText } from '#shared/format/prose-field'
import type { SpeechLineField } from '~/utils/speech-line-flow'

const lines = defineModel<WizardLineDraft[]>('lines', { default: () => [] })

withDefaults(defineProps<{
  autoOpen?: boolean
}>(), {
  autoOpen: false,
})

const sessionOpen = ref(false)
const manualOpen = ref(false)
const manualDraft = ref(emptyWizardLine())

watch(() => manualDraft.value.description, () => {
  applyInferredLineType(manualDraft.value)
})

function onManualFieldBlur() {
  applyInferredLineType(manualDraft.value)
}

const {
  active,
  supported,
  status,
  prompt,
  lastHeard,
  error,
  captured,
  editingIndex,
  fieldLabel,
  start,
  resume,
  stop,
  retryListen,
} = useSpeechLineFlow({
  lineCount: () => lines.value.length,
  getLine: index => lines.value[index],
  onLineSaved: (line) => {
    lines.value = [...lines.value, line]
  },
  onLineUpdated: (line, index) => {
    const next = [...lines.value]
    next[index] = line
    lines.value = next
  },
})

const capturedEntries = computed(() => {
  const fields: SpeechLineField[] = ['type', 'description', 'qty', 'rate']
  return fields
    .filter(f => captured.value[f])
    .map(f => ({
      key: f,
      label: fieldLabel(f),
      value: f === 'type'
        ? lineTypeLabel(captured.value[f] as WizardLineType)
        : captured.value[f]!,
    }))
})

const feedback = computed(() => {
  if (error.value) return error.value
  if (!sessionOpen.value) {
    return lines.value.length
      ? 'Tap the mic to add or edit a line'
      : 'Tap the mic to add your first line'
  }
  switch (status.value) {
    case 'speaking':
      return prompt.value || 'Listen…'
    case 'listening':
      return 'Speak now'
    case 'processing':
      return 'Got it…'
    default:
      return prompt.value || 'Say add line, edit line, or done when finished'
  }
})

const orbState = computed(() => {
  if (!sessionOpen.value) return 'idle'
  return status.value === 'idle' ? 'ready' : status.value
})

function openSession() {
  sessionOpen.value = true
  manualOpen.value = false
  unlockSpeechFromUserGesture({ silent: true })
  nextTick(() => start())
}

function finishSession() {
  stop()
  sessionOpen.value = false
}

function cancelSession() {
  stop()
  sessionOpen.value = false
}

const editHint = computed(() => {
  const n = lines.value.length
  if (n <= 1) return '1'
  return `1 to ${n}`
})

function onOrbTap() {
  unlockSpeechFromUserGesture({ silent: true })
  if (!sessionOpen.value) {
    openSession()
    return
  }
  if (!active.value) {
    resume()
    return
  }
  if (supported.value && (status.value === 'listening' || status.value === 'idle')) {
    retryListen()
  }
}

function removeLine(index: number) {
  lines.value = lines.value.filter((_, i) => i !== index)
}

function saveManualLine(addAnother: boolean) {
  const d = manualDraft.value
  if (!d.lineType || !d.description.trim() || !d.qty.trim() || !d.rate.trim()) return
  const amount = calcLineAmount(d.qty, d.rate)
  lines.value = [...lines.value, {
    lineType: d.lineType as WizardLineType,
    description: formatFieldText(d.description.trim(), 'prose'),
    qty: d.qty.trim(),
    rate: d.rate.trim(),
    amount,
  }]
  manualDraft.value = emptyWizardLine()
  if (!addAnother) manualOpen.value = false
}

onBeforeUnmount(() => stop())

defineExpose({ openWizard: openSession })
</script>

<template>
  <div class="li-wizard">
    <section v-if="lines.length" class="li-list" aria-label="Lines added">
      <CommonLineItemsTable
        :lines="lines"
        title="Your lines"
        removable
        :editing-index="editingIndex"
        :session-open="sessionOpen"
        @remove="removeLine"
      />
      <p class="li-list-hint">
        Say <b>add line</b> or <b>add another</b> for more.
        Say <b>edit line 1</b> or <b>edit line {{ editHint }}</b> to change a line.
        Say <b>done</b> when finished.
      </p>
    </section>

    <section class="li-voice" :class="{ active: sessionOpen }">
      <button
        type="button"
        class="li-orb"
        :class="orbState"
        :aria-label="sessionOpen ? 'Voice assistant' : 'Start voice entry'"
        @click="onOrbTap"
      >
        <span class="li-orb-icon" aria-hidden="true">🎙️</span>
      </button>

      <p class="li-feedback" :class="{ error: !!error }" aria-live="polite">{{ feedback }}</p>

      <p v-if="sessionOpen && lastHeard" class="li-heard">
        You said: “{{ lastHeard }}”
      </p>

      <div v-if="sessionOpen && capturedEntries.length" class="li-captured">
        <div v-for="entry in capturedEntries" :key="entry.key" class="li-captured-row">
          <span class="k">{{ entry.label }}</span>
          <span class="v">{{ entry.value }}</span>
        </div>
      </div>

      <div v-if="sessionOpen" class="li-voice-actions">
        <button
          v-if="supported && (status === 'listening' || status === 'idle')"
          type="button"
          class="li-retry"
          @click="retryListen"
        >
          Tap to speak again
        </button>
        <button
          type="button"
          class="li-done"
          @click="finishSession"
        >
          Done adding lines
        </button>
        <button
          type="button"
          class="li-cancel"
          @click="cancelSession"
        >
          Cancel
        </button>
      </div>
    </section>

    <details class="li-manual" :open="manualOpen || !supported">
      <summary @click.prevent="manualOpen = !manualOpen">Type a line instead</summary>
      <div class="li-manual-body">
        <label class="fld">
          <span>Type</span>
          <select v-model="manualDraft.lineType">
            <option value="">Select…</option>
            <option v-for="t in WIZARD_LINE_TYPES" :key="t" :value="t">{{ lineTypeLabel(t) }}</option>
          </select>
        </label>
        <label class="fld">
          <span>Description</span>
          <input v-model="manualDraft.description" data-prose="prose" type="text" placeholder="What was done?" @blur="onManualFieldBlur">
        </label>
        <label class="fld">
          <span>{{ manualDraft.lineType === 'labor' ? 'Hours' : 'Quantity' }}</span>
          <input v-model="manualDraft.qty" type="text" inputmode="decimal" @blur="onManualFieldBlur">
        </label>
        <label class="fld">
          <span>Rate</span>
          <input v-model="manualDraft.rate" type="text" inputmode="decimal" @blur="onManualFieldBlur">
        </label>
        <div class="li-manual-actions">
          <button type="button" class="btn primary" @click="saveManualLine(true)">Save &amp; add another</button>
          <button type="button" class="btn" @click="saveManualLine(false)">Save line</button>
        </div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.li-wizard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.li-list-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.4;
}

.li-list-hint b {
  color: #64748b;
  font-weight: 600;
}

.li-voice {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8px 0 4px;
}

.li-orb {
  appearance: none;
  border: none;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #eef2ff;
  border: 2px solid #c7d2fe;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s;
}

.li-orb-icon {
  font-size: 38px;
  line-height: 1;
}

.li-orb.idle {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.li-orb.idle:hover {
  background: #eef2ff;
  border-color: #c7d2fe;
}

.li-orb.speaking,
.li-orb.processing {
  background: #f1f5f9;
  border-color: #cbd5e1;
  transform: scale(0.96);
}

.li-orb.listening,
.li-orb.ready {
  background: #4f46e5;
  border-color: #4f46e5;
  box-shadow: 0 0 0 8px rgba(79, 70, 229, 0.15);
}

.li-orb.listening {
  animation: li-orb-pulse 1.4s ease-in-out infinite;
}

@keyframes li-orb-pulse {
  0%, 100% { box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.1); }
  50% { box-shadow: 0 0 0 14px rgba(79, 70, 229, 0.2); }
}

.li-feedback {
  margin: 14px 0 0;
  font-size: 15px;
  line-height: 1.45;
  color: #475569;
  max-width: 34ch;
}

.li-voice.active .li-feedback {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.li-feedback.error {
  color: #dc2626;
  font-weight: 500;
}

.li-heard {
  margin: 8px 0 0;
  font-size: 13px;
  color: #64748b;
  max-width: 36ch;
  line-height: 1.4;
}

.li-captured {
  margin-top: 12px;
  width: 100%;
  max-width: 360px;
  text-align: left;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
  padding: 10px 12px;
}

.li-captured-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  padding: 4px 0;
}

.li-captured-row .k {
  color: #64748b;
  font-weight: 600;
}

.li-captured-row .v {
  color: #0f172a;
  text-align: right;
}

.li-voice-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
}

.li-retry,
.li-done,
.li-cancel {
  appearance: none;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 12px;
}

.li-retry,
.li-done {
  color: #6366f1;
}

.li-cancel {
  color: #94a3b8;
}

.li-manual {
  border-top: 1px solid #e2e8f0;
  padding-top: 12px;
}

.li-manual summary {
  font-size: 14px;
  font-weight: 600;
  color: #6366f1;
  cursor: pointer;
  list-style: none;
}

.li-manual summary::-webkit-details-marker {
  display: none;
}

.li-manual-body {
  margin-top: 12px;
  text-align: left;
}

.li-manual-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.li-manual-actions .btn {
  width: 100%;
  justify-content: center;
  min-height: 48px;
}
</style>
