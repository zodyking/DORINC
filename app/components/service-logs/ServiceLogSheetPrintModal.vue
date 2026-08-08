<script setup lang="ts">
import { syncFetchErrorMessage } from '~/utils/fetch-blob-error'

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  'print-device': []
  'staples-sent': [{ jobId: string }]
}>()

type StaplesJob = {
  id: string
  status: string
  releaseCode: string | null
  errorMessage: string | null
  locatorUrl: string
  emailedAt: string | null
  readyAt: string | null
  expiresAt: string | null
  createdAt: string
  printMeTo: string
  delivered?: boolean
  attachmentFilename?: string | null
  attachmentBytes?: number | null
}

type Step = 'choose' | 'staples'

const deviceBusy = ref(false)
const staplesBusy = ref(false)
const step = ref<Step>('choose')
const staplesError = ref('')

function resetStaples() {
  staplesError.value = ''
  staplesBusy.value = false
  step.value = 'choose'
}

function close() {
  if (deviceBusy.value || staplesBusy.value) return
  open.value = false
  resetStaples()
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'sl-print-scrim') close()
}

watch(open, (isOpen) => {
  if (!isOpen) resetStaples()
})

async function chooseDevice() {
  if (deviceBusy.value || staplesBusy.value) return
  deviceBusy.value = true
  try {
    emit('print-device')
    open.value = false
    resetStaples()
  }
  finally {
    deviceBusy.value = false
  }
}

async function chooseStaples() {
  if (deviceBusy.value || staplesBusy.value) return
  staplesBusy.value = true
  staplesError.value = ''
  step.value = 'staples'
  try {
    const res = await $fetch<{ job: StaplesJob }>('/api/service-logs/sheet/staples-print', {
      method: 'POST',
    })
    if (res.job.status === 'failed') {
      staplesError.value = res.job.errorMessage || 'Could not email Staples PrintMe'
      staplesBusy.value = false
      return
    }
    emit('staples-sent', { jobId: res.job.id })
    open.value = false
    resetStaples()
  }
  catch (e: unknown) {
    staplesBusy.value = false
    staplesError.value = syncFetchErrorMessage(e, 'Could not start Staples PrintMe')
  }
}
</script>

<template>
  <div
    id="sl-print-scrim"
    class="modal-scrim"
    :class="{ open }"
    :aria-hidden="!open"
    @click="onScrimClick"
  >
    <div
      class="modal sl-print-modal"
      role="dialog"
      aria-labelledby="sl-print-title"
      aria-modal="true"
      @click.stop
    >
      <div class="mhead">
        <div>
          <h3 id="sl-print-title">
            {{ step === 'staples' ? 'Print via Staples' : 'Print Template' }}
          </h3>
          <p>
            {{ step === 'staples'
              ? 'Sending the sheet to Staples PrintMe…'
              : 'Choose how to print the blank Letter service catalog' }}
          </p>
        </div>
        <button
          type="button"
          class="close"
          aria-label="Close"
          :disabled="deviceBusy || staplesBusy"
          @click="close"
        >
          ✕
        </button>
      </div>

      <div class="mbody">
        <div v-if="step === 'choose'" class="sl-print-options" role="list">
          <button
            type="button"
            class="sl-print-option"
            role="listitem"
            :disabled="deviceBusy || staplesBusy"
            @click="chooseDevice"
          >
            <span class="sl-print-option-title">
              {{ deviceBusy ? 'Opening…' : 'Print from this device' }}
            </span>
            <span class="sl-print-option-desc">
              Open the PDF preview and print with your local printer
            </span>
          </button>

          <button
            type="button"
            class="sl-print-option"
            role="listitem"
            :disabled="deviceBusy || staplesBusy"
            @click="chooseStaples"
          >
            <span class="sl-print-option-title">
              Print via Staples
            </span>
            <span class="sl-print-option-desc">
              Email to Staples PrintMe — the release code appears on the Staples page when ready
            </span>
          </button>
        </div>

        <div v-else class="sl-staples">
          <div v-if="!staplesError" class="sl-staples-wait">
            <span class="sl-staples-spinner" aria-hidden="true" />
            <strong>Sending to Staples PrintMe…</strong>
            <p>After the email sends, this dialog closes. Your release code will show on the Staples page.</p>
          </div>
          <p v-if="staplesError" class="sl-staples-error">{{ staplesError }}</p>
        </div>
      </div>

      <div class="mfoot">
        <button
          v-if="step === 'staples'"
          type="button"
          class="btn"
          :disabled="staplesBusy"
          @click="resetStaples"
        >
          Back
        </button>
        <button
          type="button"
          class="btn"
          :disabled="deviceBusy || staplesBusy"
          @click="close"
        >
          Cancel
        </button>
        <button
          v-if="step === 'staples' && staplesError"
          type="button"
          class="btn primary"
          :disabled="staplesBusy"
          @click="chooseStaples"
        >
          Try again
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sl-print-modal {
  width: min(440px, 94vw);
}
.sl-print-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sl-print-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}
.sl-print-option:hover:not(:disabled) {
  border-color: #c7d2fe;
  background: #f8fafc;
}
.sl-print-option:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}
.sl-print-option:disabled {
  opacity: 0.72;
  cursor: not-allowed;
  background: #f8fafc;
}
.sl-print-option-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}
.sl-print-option-desc {
  font-size: 12.5px;
  line-height: 1.35;
  color: #64748b;
}
.sl-staples-wait {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
  padding: 8px 4px 4px;
}
.sl-staples-wait p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: #64748b;
  max-width: 36ch;
}
.sl-staples-wait strong {
  font-size: 15px;
  color: #0f172a;
}
.sl-staples-spinner {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 2.5px solid #c7d2fe;
  border-top-color: #4f46e5;
  animation: slStaplesSpin 0.7s linear infinite;
}
.sl-staples-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: #b91c1c;
  text-align: center;
  line-height: 1.4;
}
@keyframes slStaplesSpin {
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  .sl-staples-spinner { animation: none; }
}
</style>
