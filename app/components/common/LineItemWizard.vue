<script setup lang="ts">
import {
  calcLineAmount,
  emptyWizardLine,
  qtyLabelForLineType,
  qtyPlaceholderForLineType,
  rateLabelForLineType,
  ratePlaceholderForLineType,
  WIZARD_LINE_TYPES,
  type WizardLineDraft,
  type WizardLineType,
} from '~/utils/line-item-wizard-ui'
import { lineTypeLabel } from '~/utils/invoices-ui'
import { catalogTypePill } from '~/utils/catalog-ui'

const lines = defineModel<WizardLineDraft[]>('lines', { default: () => [] })

withDefaults(defineProps<{
  listHint?: string
  autoOpen?: boolean
}>(), {
  listHint: 'Line items saved. Add more or continue when ready.',
  autoOpen: true,
})

const wizardOpen = ref(false)
const wizardStep = ref(1)
const draft = ref(emptyWizardLine())
const descRef = ref<HTMLInputElement | null>(null)

const voiceDictation = useVoiceDictation((text) => {
  const sep = draft.value.description.trim() ? ' ' : ''
  draft.value.description += `${sep}${text}`
  nextTick(() => descRef.value?.focus())
})

const { listening: voiceListening, supported: voiceSupported, error: voiceError, toggle: toggleVoice } = voiceDictation

const previewAmount = computed(() => calcLineAmount(draft.value.qty, draft.value.rate))

const canNext = computed(() => {
  if (wizardStep.value === 1) return !!draft.value.lineType
  if (wizardStep.value === 2) return !!draft.value.description.trim()
  if (wizardStep.value === 3) return !!draft.value.qty.trim()
  if (wizardStep.value === 4) return !!draft.value.rate.trim()
  return true
})

function openWizard() {
  voiceDictation.stop()
  draft.value = emptyWizardLine()
  wizardStep.value = 1
  wizardOpen.value = true
  unlockSpeechFromUserGesture({ silent: true })
}

function closeWizard() {
  voiceDictation.stop()
  wizardOpen.value = false
}

function selectType(type: WizardLineType) {
  draft.value.lineType = type
  wizardStep.value = 2
}

function nextStep() {
  if (!canNext.value) return
  if (wizardStep.value < 4) wizardStep.value += 1
  else wizardStep.value = 5
}

function prevStep() {
  voiceDictation.stop()
  if (wizardStep.value > 1) wizardStep.value -= 1
  else closeWizard()
}

function saveLine(addAnother: boolean) {
  if (!draft.value.lineType || !draft.value.description.trim()) return
  const amount = calcLineAmount(draft.value.qty, draft.value.rate)
  lines.value = [...lines.value, {
    lineType: draft.value.lineType as WizardLineType,
    description: draft.value.description.trim(),
    qty: draft.value.qty.trim(),
    rate: draft.value.rate.trim(),
    amount,
  }]
  if (addAnother) {
    draft.value = emptyWizardLine()
    wizardStep.value = 1
  }
  else {
    closeWizard()
  }
}

function removeLine(index: number) {
  lines.value = lines.value.filter((_, i) => i !== index)
}

onMounted(() => {
  if (autoOpen && !lines.value.length) openWizard()
})

onBeforeUnmount(() => voiceDictation.stop())

defineExpose({ openWizard })
</script>

<template>
  <div class="li-wizard-root">
    <div v-if="lines.length && !wizardOpen" class="li-lines-list">
      <p class="sl-hint">{{ listHint }}</p>
      <div class="li-lines-cards">
        <div v-for="(line, i) in lines" :key="i" class="li-line-card">
          <div class="li-line-card-top">
            <span :class="catalogTypePill(line.lineType)">{{ lineTypeLabel(line.lineType) }}</span>
            <button type="button" class="li-line-rm" aria-label="Remove line" @click="removeLine(i)">×</button>
          </div>
          <b class="li-line-desc">{{ line.description }}</b>
          <span class="li-line-meta">
            {{ qtyLabelForLineType(line.lineType) }} {{ line.qty }}
            · {{ rateLabelForLineType(line.lineType) }} {{ line.rate }}
            <template v-if="line.amount"> · {{ moneyDisplay(line.amount) }}</template>
          </span>
        </div>
      </div>
      <button type="button" class="btn li-add-line-btn" @click="openWizard">+ Add another line</button>
    </div>

    <div v-if="wizardOpen" class="li-line-wizard">
      <p class="li-wizard-progress">Line item · step {{ wizardStep }} of 5</p>

      <div v-if="wizardStep === 1" class="li-wizard-panel">
        <h4>What type of item?</h4>
        <p class="sl-hint">Pick labor, part, service, or fee.</p>
        <div class="sl-picks sl-type-picks">
          <button
            v-for="type in WIZARD_LINE_TYPES"
            :key="type"
            type="button"
            class="sl-pick"
            :class="{ on: draft.lineType === type }"
            @click="selectType(type)"
          >
            <span class="nm">
              <b>{{ lineTypeLabel(type) }}</b>
              <small>{{ type === 'labor' ? 'Bill by the hour' : type === 'part' ? 'Parts & materials' : type === 'service' ? 'Shop services' : 'Flat fees' }}</small>
            </span>
            <span class="chk" />
          </button>
        </div>
      </div>

      <div v-else-if="wizardStep === 2" class="li-wizard-panel">
        <h4>What was done?</h4>
        <p class="sl-hint">Describe the work or item — tap the mic to speak it.</p>
        <label class="fld">
          <span>Description</span>
          <input
            ref="descRef"
            v-model="draft.description"
            type="text"
            placeholder="e.g. Replaced front brake pads"
          >
        </label>
        <button
          v-if="voiceSupported"
          type="button"
          class="sl-voice-btn"
          :class="{ on: voiceListening }"
          :aria-pressed="voiceListening"
          @click="toggleVoice"
        >
          <span class="sl-voice-ico" aria-hidden="true">{{ voiceListening ? '■' : '🎙️' }}</span>
          <span>{{ voiceListening ? 'Listening… tap to stop' : 'Tap to speak' }}</span>
        </button>
        <p v-if="voiceError" class="help" style="color:#dc2626;">{{ voiceError }}</p>
      </div>

      <div v-else-if="wizardStep === 3" class="li-wizard-panel">
        <h4>{{ qtyLabelForLineType(draft.lineType as WizardLineType) }}</h4>
        <p class="sl-hint">
          {{ draft.lineType === 'labor' ? 'How many hours?' : 'How many units?' }}
        </p>
        <label class="fld">
          <span>{{ qtyLabelForLineType(draft.lineType as WizardLineType) }}</span>
          <input
            v-model="draft.qty"
            type="text"
            inputmode="decimal"
            :placeholder="qtyPlaceholderForLineType(draft.lineType as WizardLineType)"
          >
        </label>
      </div>

      <div v-else-if="wizardStep === 4" class="li-wizard-panel">
        <h4>{{ rateLabelForLineType(draft.lineType as WizardLineType) }}</h4>
        <p class="sl-hint">Enter the price before tax.</p>
        <label class="fld">
          <span>{{ rateLabelForLineType(draft.lineType as WizardLineType) }}</span>
          <input
            v-model="draft.rate"
            type="text"
            inputmode="decimal"
            :placeholder="ratePlaceholderForLineType(draft.lineType as WizardLineType)"
          >
        </label>
        <p v-if="previewAmount" class="help">Line total: {{ moneyDisplay(previewAmount) }}</p>
      </div>

      <div v-else class="li-wizard-panel">
        <h4>Save this line?</h4>
        <div class="li-line-preview">
          <span :class="catalogTypePill(draft.lineType as WizardLineType)">{{ lineTypeLabel(draft.lineType as WizardLineType) }}</span>
          <b>{{ draft.description }}</b>
          <span>{{ qtyLabelForLineType(draft.lineType as WizardLineType) }} {{ draft.qty }} · {{ moneyDisplay(draft.rate) }} each</span>
          <span v-if="previewAmount" class="li-line-preview-amt">Total {{ moneyDisplay(previewAmount) }}</span>
        </div>
        <div class="li-line-save-actions">
          <button type="button" class="btn primary" @click="saveLine(true)">Save &amp; add another</button>
          <button type="button" class="btn" @click="saveLine(false)">Save &amp; finish</button>
        </div>
      </div>

      <div v-if="wizardStep > 1 && wizardStep < 5" class="li-wizard-nav">
        <button type="button" class="btn" @click="prevStep">Back</button>
        <button type="button" class="btn primary" :disabled="!canNext" @click="nextStep">Next</button>
      </div>
      <div v-else-if="wizardStep === 1 && lines.length" class="li-wizard-nav">
        <button type="button" class="btn" @click="closeWizard">Cancel</button>
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
}
.li-wizard-progress {
  margin: 0 0 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6366f1;
}
.li-wizard-panel h4 {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 800;
}
.sl-type-picks .sl-pick .nm small {
  display: block;
  margin-top: 2px;
}
.li-line-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  margin-bottom: 14px;
  font-size: 13px;
  color: #475569;
}
.li-line-preview b {
  color: #0f172a;
  font-size: 15px;
}
.li-line-preview-amt {
  font-weight: 700;
  color: #4f46e5;
}
.li-line-save-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.li-line-save-actions .btn {
  width: 100%;
  justify-content: center;
  min-height: 48px;
}
.li-wizard-nav {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}
.li-wizard-nav .btn {
  flex: 1;
  justify-content: center;
  min-height: 48px;
}
</style>
