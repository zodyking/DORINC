<script setup lang="ts">
import { lineTypeLabel } from '~/utils/invoices-ui'
import { catalogTypePill } from '~/utils/catalog-ui'
import type { WizardLineDraft } from '~/utils/line-item-wizard-ui'
import type { SpeechLineField } from '~/utils/speech-line-flow'

const lines = defineModel<WizardLineDraft[]>('lines', { default: () => [] })

withDefaults(defineProps<{
  listHint?: string
  autoOpen?: boolean
}>(), {
  listHint: 'Lines saved. Tap below to add more by voice.',
  autoOpen: true,
})

const sessionOpen = ref(false)

const speech = useSpeechLineFlow((line, addAnother) => {
  lines.value = [...lines.value, line]
  if (!addAnother) {
    sessionOpen.value = false
  }
})

const statusLabel = computed(() => {
  switch (speech.status.value) {
    case 'speaking': return 'Listen…'
    case 'listening': return 'Your turn — speak now'
    case 'processing': return 'Got it…'
    default: return 'Ready'
  }
})

const capturedEntries = computed(() => {
  const fields: SpeechLineField[] = ['type', 'description', 'qty', 'rate']
  return fields
    .filter(f => speech.captured.value[f])
    .map(f => ({
      key: f,
      label: speech.fieldLabel(f),
      value: f === 'type'
        ? lineTypeLabel(speech.captured.value[f] as 'labor')
        : speech.captured.value[f]!,
    }))
})

function openSession() {
  sessionOpen.value = true
  unlockSpeechFromUserGesture({ silent: true })
  speech.start()
}

function cancelSession() {
  speech.stop()
  sessionOpen.value = false
}

function removeLine(index: number) {
  lines.value = lines.value.filter((_, i) => i !== index)
}

onMounted(() => {
  if (autoOpen && !lines.value.length) openSession()
})

onBeforeUnmount(() => speech.stop())

defineExpose({ openWizard: openSession })
</script>

<template>
  <div class="li-wizard-root">
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
      <button
        v-if="speech.supported"
        type="button"
        class="btn primary li-add-line-btn"
        @click="openSession"
      >
        + Add another line by voice
      </button>
    </div>

    <div v-if="sessionOpen" class="li-speech-flow">
      <div
        class="li-speech-orb"
        :class="{
          speaking: speech.status === 'speaking',
          listening: speech.status === 'listening',
          processing: speech.status === 'processing',
        }"
        aria-hidden="true"
      >
        🎙️
      </div>

      <p class="li-speech-status">{{ statusLabel }}</p>
      <p class="li-speech-prompt">{{ speech.prompt }}</p>

      <p v-if="speech.lastHeard" class="li-speech-heard">
        You said: “{{ speech.lastHeard }}”
      </p>

      <div v-if="capturedEntries.length" class="li-speech-captured">
        <div v-for="entry in capturedEntries" :key="entry.key" class="li-speech-cap-row">
          <span class="k">{{ entry.label }}</span>
          <span class="v">{{ entry.value }}</span>
        </div>
      </div>

      <p v-if="speech.error" class="help" style="color:#dc2626;">{{ speech.error }}</p>

      <div v-if="!speech.supported" class="li-speech-fallback">
        Voice is not supported in this browser. Use manual entry instead.
      </div>

      <div v-else class="li-speech-actions">
        <button
          v-if="speech.status === 'listening' || speech.status === 'idle'"
          type="button"
          class="sl-voice-btn"
          @click="speech.retryListen"
        >
          Tap to speak again
        </button>
        <button type="button" class="btn ghost sm" @click="cancelSession">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
.li-speech-fallback {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  padding: 12px;
}
</style>
