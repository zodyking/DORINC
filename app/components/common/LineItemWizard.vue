<script setup lang="ts">
import { lineTypeLabel } from '~/utils/invoices-ui'
import { catalogTypePill } from '~/utils/catalog-ui'
import {
  calcLineAmount,
  emptyWizardLine,
  WIZARD_LINE_TYPES,
  type WizardLineDraft,
  type WizardLineType,
} from '~/utils/line-item-wizard-ui'

const lines = defineModel<WizardLineDraft[]>('lines', { default: () => [] })

withDefaults(defineProps<{
  autoOpen?: boolean
}>(), {
  autoOpen: false,
})

const sessionOpen = ref(false)
const manualOpen = ref(false)
const manualDraft = ref(emptyWizardLine())

const {
  supported,
  status,
  prompt,
  error,
  editingIndex,
  start,
  stop,
  retryListen,
} = useSpeechLineFlow({
  lineCount: () => lines.value.length,
  getLine: index => lines.value[index],
  onLineSaved: (line, addAnother) => {
    lines.value = [...lines.value, line]
    if (!addAnother) sessionOpen.value = false
  },
  onLineUpdated: (line, index) => {
    const next = [...lines.value]
    next[index] = line
    lines.value = next
  },
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
      return prompt.value || 'Say add line, or edit line item number'
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

function onOrbTap() {
  unlockSpeechFromUserGesture({ silent: true })
  if (!sessionOpen.value) {
    openSession()
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
    description: d.description.trim(),
    qty: d.qty.trim(),
    rate: d.rate.trim(),
    amount,
  }]
  manualDraft.value = emptyWizardLine()
  manualOpen.value = false
  sessionOpen.value = addAnother
  if (addAnother) nextTick(() => start())
}

function displayAmount(line: WizardLineDraft) {
  return line.amount || calcLineAmount(line.qty, line.rate)
}

onBeforeUnmount(() => stop())

defineExpose({ openWizard: openSession })
</script>

<template>
  <div class="li-wizard">
    <section v-if="lines.length" class="li-list" aria-label="Lines added">
      <p class="li-list-title">Your lines</p>
      <div class="tscroll li-table-wrap">
        <table class="ed-lines li-lines-table">
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th class="col-type">Type</th>
              <th class="col-desc">Description</th>
              <th class="col-qty">Qty / Hrs</th>
              <th class="col-rate">Rate</th>
              <th class="col-amt">Amount</th>
              <th class="col-rm" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(line, i) in lines"
              :key="i"
              class="li-line-row"
              :class="{ editing: sessionOpen && editingIndex === i }"
            >
              <td class="col-num">{{ i + 1 }}</td>
              <td class="col-type">
                <span :class="catalogTypePill(line.lineType)">{{ lineTypeLabel(line.lineType) }}</span>
              </td>
              <td class="col-desc">{{ line.description }}</td>
              <td class="col-qty">{{ line.qty }}</td>
              <td class="col-rate">{{ line.rate }}</td>
              <td class="col-amt">{{ displayAmount(line) ? moneyDisplay(displayAmount(line)) : '—' }}</td>
              <td class="col-rm">
                <button type="button" class="rm" aria-label="Remove line" @click="removeLine(i)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="li-list-hint">Say <b>edit line item number 1</b> to review a line</p>
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

      <p class="li-feedback" :class="{ error: !!error }">{{ feedback }}</p>

      <button
        v-if="sessionOpen"
        type="button"
        class="li-done"
        @click="finishSession"
      >
        Done adding lines
      </button>
    </section>

    <details v-if="!supported" class="li-manual" :open="manualOpen">
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
          <input v-model="manualDraft.description" data-prose="prose" type="text" placeholder="What was done?">
        </label>
        <label class="fld">
          <span>{{ manualDraft.lineType === 'labor' ? 'Hours' : 'Quantity' }}</span>
          <input v-model="manualDraft.qty" type="text" inputmode="decimal">
        </label>
        <label class="fld">
          <span>Rate</span>
          <input v-model="manualDraft.rate" type="text" inputmode="decimal">
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

.li-list-title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
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

.li-table-wrap {
  margin: 0;
}

.li-lines-table {
  min-width: 520px;
}

.li-lines-table .col-num {
  width: 32px;
  color: #94a3b8;
  font-weight: 700;
  font-size: 12px;
}

.li-lines-table .col-type { width: 88px; }
.li-lines-table .col-qty { width: 72px; }
.li-lines-table .col-rate { width: 80px; }
.li-lines-table .col-amt {
  width: 88px;
  text-align: right;
  font-weight: 600;
}

.li-lines-table .col-rm { width: 36px; }

.li-line-row.editing {
  background: #eef2ff;
}

.li-line-row.editing td {
  box-shadow: inset 0 0 0 2px #818cf8;
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
  max-width: 30ch;
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

.li-done {
  margin-top: 12px;
  appearance: none;
  border: none;
  background: none;
  color: #6366f1;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 8px 12px;
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
