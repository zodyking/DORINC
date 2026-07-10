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
import type { SpeechLineField } from '~/utils/speech-line-flow'

const lines = defineModel<WizardLineDraft[]>('lines', { default: () => [] })

withDefaults(defineProps<{
  listHint?: string
  autoOpen?: boolean
}>(), {
  listHint: 'Lines saved. Tap below to add more by voice.',
  autoOpen: false,
})

const sessionOpen = ref(false)
const manualDraft = ref(emptyWizardLine())

const {
  supported,
  status,
  prompt,
  lastHeard,
  error,
  captured,
  fieldLabel,
  start,
  stop,
  retryListen,
} = useSpeechLineFlow((line, addAnother) => {
  lines.value = [...lines.value, line]
  if (!addAnother) sessionOpen.value = false
})

const statusLabel = computed(() => {
  switch (status.value) {
    case 'speaking': return 'Listen…'
    case 'listening': return 'Your turn — speak now'
    case 'processing': return 'Got it…'
    default: return sessionOpen.value ? 'Ready' : ''
  }
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

function openSession() {
  sessionOpen.value = true
  unlockSpeechFromUserGesture({ silent: true })
  nextTick(() => start())
}

function cancelSession() {
  stop()
  sessionOpen.value = false
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
  if (addAnother) {
    sessionOpen.value = true
  }
  else {
    sessionOpen.value = false
  }
}

onBeforeUnmount(() => stop())

defineExpose({ openWizard: openSession })
</script>

<template>
  <div class="li-wizard-root">
    <!-- Saved lines -->
    <div v-if="lines.length && !sessionOpen" class="li-lines-list">
      <p class="sl-hint">{{ listHint }}</p>
      <div class="li-lines-cards">
        <div v-for="(line, i) in lines" :key="i" class="li-line-card">
          <div class="li-line-card-top">
            <span :class="catalogTypePill(line.lineType)">{{ lineTypeLabel(line.lineType) }}</span>
            <button type="button" class="li-line-rm" aria-label="Remove line" @click="removeLine(i)">×</button>
          </div>
          <b class="li-line-desc">{{ line.description }}</b>
          <span class="li-line-meta">
            {{ line.qty }} × {{ line.rate }}
            <template v-if="line.amount"> · {{ moneyDisplay(line.amount) }}</template>
          </span>
        </div>
      </div>
      <button type="button" class="btn primary li-add-line-btn" @click="openSession">
        + Add another line by voice
      </button>
    </div>

    <!-- Start CTA — always visible when no session and no saved lines -->
    <div v-else-if="!sessionOpen" class="li-start-cta">
      <button type="button" class="sl-voice-btn li-start-btn" @click="openSession">
        <span class="sl-voice-ico" aria-hidden="true">🎙️</span>
        <span>Tap to start — add lines by voice</span>
      </button>
      <p class="help">The app will ask each question out loud. You answer by speaking.</p>
    </div>

    <!-- Active voice session -->
    <div v-else class="li-speech-flow">
      <div
        class="li-speech-orb"
        :class="{
          speaking: status === 'speaking',
          listening: status === 'listening',
          processing: status === 'processing',
        }"
        aria-hidden="true"
      >
        🎙️
      </div>

      <p v-if="statusLabel" class="li-speech-status">{{ statusLabel }}</p>
      <p class="li-speech-prompt">{{ prompt || 'Labor, part, service, or fee?' }}</p>

      <p v-if="lastHeard" class="li-speech-heard">
        You said: “{{ lastHeard }}”
      </p>

      <div v-if="capturedEntries.length" class="li-speech-captured">
        <div v-for="entry in capturedEntries" :key="entry.key" class="li-speech-cap-row">
          <span class="k">{{ entry.label }}</span>
          <span class="v">{{ entry.value }}</span>
        </div>
      </div>

      <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>

      <div v-if="supported" class="li-speech-actions">
        <button
          type="button"
          class="sl-voice-btn"
          :class="{ on: status === 'listening' }"
          @click="retryListen"
        >
          <span class="sl-voice-ico" aria-hidden="true">{{ status === 'listening' ? '■' : '🎙️' }}</span>
          <span>{{ status === 'listening' ? 'Listening… tap to stop' : 'Tap to speak' }}</span>
        </button>
      </div>

      <!-- Manual fallback when voice unavailable or user prefers typing -->
      <div v-if="!supported || error" class="li-manual-fallback">
        <p class="sl-hint">Or type the line manually:</p>
        <label class="fld">
          <span>Type</span>
          <select v-model="manualDraft.lineType">
            <option value="">Select…</option>
            <option v-for="t in WIZARD_LINE_TYPES" :key="t" :value="t">{{ lineTypeLabel(t) }}</option>
          </select>
        </label>
        <label class="fld">
          <span>Description</span>
          <input v-model="manualDraft.description" type="text" placeholder="What was done?">
        </label>
        <label class="fld">
          <span>{{ manualDraft.lineType === 'labor' ? 'Hours' : 'Quantity' }}</span>
          <input v-model="manualDraft.qty" type="text" inputmode="decimal">
        </label>
        <label class="fld">
          <span>Rate</span>
          <input v-model="manualDraft.rate" type="text" inputmode="decimal">
        </label>
        <div class="li-line-save-actions">
          <button type="button" class="btn primary" @click="saveManualLine(true)">Save &amp; add another</button>
          <button type="button" class="btn" @click="saveManualLine(false)">Save &amp; finish</button>
        </div>
      </div>

      <button type="button" class="btn ghost sm" style="margin-top:12px;" @click="cancelSession">Cancel</button>
    </div>
  </div>
</template>

<style scoped>
.li-start-cta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 8px 0 4px;
}
.li-start-btn {
  min-height: 56px;
  font-size: 16px;
}
.li-lines-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 14px;
}
.li-line-card {
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.li-line-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.li-line-rm {
  appearance: none;
  border: none;
  background: #f1f5f9;
  color: #64748b;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.li-line-desc {
  display: block;
  font-size: 14px;
  margin-bottom: 4px;
}
.li-line-meta {
  font-size: 12px;
  color: #64748b;
}
.li-add-line-btn {
  width: 100%;
  justify-content: center;
  min-height: 48px;
}
.li-speech-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 8px 0 4px;
  width: 100%;
}
.li-speech-orb {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 36px;
  background: #eef2ff;
  border: 2px solid #c7d2fe;
  margin-bottom: 16px;
  transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
}
.li-speech-orb.speaking {
  background: #f8fafc;
  border-color: #cbd5e1;
  transform: scale(0.96);
}
.li-speech-orb.listening {
  background: #4f46e5;
  border-color: #4f46e5;
  box-shadow: 0 0 0 8px rgba(79, 70, 229, 0.18);
  animation: li-pulse 1.4s ease-in-out infinite;
}
.li-speech-orb.processing {
  background: #eef2ff;
  border-color: #818cf8;
}
@keyframes li-pulse {
  0%, 100% { box-shadow: 0 0 0 6px rgba(79, 70, 229, 0.12); }
  50% { box-shadow: 0 0 0 14px rgba(79, 70, 229, 0.22); }
}
.li-speech-status {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6366f1;
}
.li-speech-prompt {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 800;
  line-height: 1.3;
  color: #0f172a;
  max-width: 28ch;
}
.li-speech-heard {
  margin: 0 0 12px;
  font-size: 14px;
  color: #64748b;
  font-style: italic;
  max-width: 100%;
  word-break: break-word;
}
.li-speech-captured {
  width: 100%;
  text-align: left;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 14px;
}
.li-speech-cap-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px solid #f1f5f9;
}
.li-speech-cap-row:last-child { border-bottom: none; }
.li-speech-cap-row .k {
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.li-speech-cap-row .v {
  color: #0f172a;
  font-weight: 600;
  text-align: right;
}
.li-speech-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.li-manual-fallback {
  width: 100%;
  text-align: left;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}
.li-line-save-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}
.li-line-save-actions .btn {
  width: 100%;
  justify-content: center;
  min-height: 48px;
}
</style>
