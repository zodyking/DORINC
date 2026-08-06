<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  'print-device': []
}>()

const deviceBusy = ref(false)

function close() {
  if (deviceBusy.value) return
  open.value = false
}

function onScrimClick(e: MouseEvent) {
  if ((e.target as HTMLElement).id === 'sl-print-scrim') close()
}

async function chooseDevice() {
  if (deviceBusy.value) return
  deviceBusy.value = true
  try {
    emit('print-device')
    open.value = false
  }
  finally {
    deviceBusy.value = false
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
          <h3 id="sl-print-title">Print Service Log Sheet</h3>
          <p>Choose how to print the blank Letter service catalog</p>
        </div>
        <button type="button" class="close" aria-label="Close" :disabled="deviceBusy" @click="close">✕</button>
      </div>

      <div class="mbody">
        <div class="sl-print-options" role="list">
          <button
            type="button"
            class="sl-print-option"
            role="listitem"
            :disabled="deviceBusy"
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
            disabled
            aria-disabled="true"
            title="Coming soon"
          >
            <span class="sl-print-option-title">
              Print via Staples
              <span class="pill">Coming soon</span>
            </span>
            <span class="sl-print-option-desc">
              Send the service log sheet to Staples for pickup printing
            </span>
          </button>
        </div>
      </div>

      <div class="mfoot">
        <button type="button" class="btn" :disabled="deviceBusy" @click="close">Cancel</button>
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
.pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  background: #e2e8f0;
  color: #475569;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
</style>
