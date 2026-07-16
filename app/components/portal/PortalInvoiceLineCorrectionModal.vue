<script setup lang="ts">
import { moneyDisplay } from '~/utils/invoices-ui'
import {
  portalInvoiceLineCorrectionFormFromLine,
  portalInvoiceLineCorrectionHasChanges,
  portalInvoiceLineCorrectionTopic,
} from '~/utils/portal-invoices-ui'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  invoiceId: string
  invoiceNumberFormatted: string
  line: {
    id: string
    description: string
    quantity: string
    unitPrice: string
    lineAmount: string
  } | null
}>()

const emit = defineEmits<{ submitted: [] }>()

const form = ref({
  description: '',
  quantity: '',
  unitPrice: '',
  notes: '',
})
const submitting = ref(false)
const error = ref('')
const success = ref('')

watch(open, (isOpen) => {
  if (isOpen && props.line) {
    form.value = portalInvoiceLineCorrectionFormFromLine(props.line)
    error.value = ''
    success.value = ''
    submitting.value = false
  }
  else if (!isOpen) {
    form.value = { description: '', quantity: '', unitPrice: '', notes: '' }
    error.value = ''
    success.value = ''
    submitting.value = false
  }
})

function close() {
  open.value = false
}

function validate(): string | null {
  if (!props.line) return 'Line item not found.'
  if (!form.value.description.trim()) return 'Description is required.'
  if (!form.value.quantity.trim()) return 'Qty/Hours is required.'
  if (!form.value.unitPrice.trim()) return 'Rate is required.'
  if (!portalInvoiceLineCorrectionHasChanges(props.line, form.value) && !form.value.notes.trim()) {
    return 'Change at least one field or add notes explaining the correction.'
  }
  return null
}

async function submit() {
  if (!props.line) return
  const validationError = validate()
  if (validationError) {
    error.value = validationError
    return
  }

  submitting.value = true
  error.value = ''
  try {
    await $fetch('/api/portal/invoice-change-requests', {
      method: 'POST',
      body: {
        invoiceId: props.invoiceId,
        topic: portalInvoiceLineCorrectionTopic(),
        lineItemCorrection: {
          lineItemId: props.line.id,
          description: form.value.description.trim(),
          quantity: form.value.quantity.trim(),
          unitPrice: form.value.unitPrice.trim(),
          notes: form.value.notes.trim() || null,
        },
      },
    })
    success.value = 'Correction request sent — the shop will review and apply if approved.'
    emit('submitted')
    setTimeout(() => close(), 1200)
  }
  catch (err: unknown) {
    const fe = err as { data?: { message?: string, data?: { message?: string } } }
    error.value = fe.data?.data?.message ?? fe.data?.message ?? 'Unable to submit correction request.'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    class="modal-scrim"
    :class="{ open }"
    aria-hidden="true"
    @click.self="close"
  >
    <div
      v-if="line"
      class="modal"
      role="dialog"
      aria-labelledby="line-correction-title"
      aria-modal="true"
    >
      <div class="mhead">
        <div>
          <h3 id="line-correction-title">Request line item correction</h3>
          <p>{{ line.description }} · {{ moneyDisplay(line.lineAmount) }}</p>
        </div>
        <button type="button" class="close" aria-label="Close" @click="close">✕</button>
      </div>
      <form @submit.prevent="submit">
        <div class="mbody">
          <p class="help">
            Enter the corrected description, qty/hours, and rate. If approved, the shop applies these changes automatically.
          </p>

          <div class="correction-grid">
            <label class="fld">
              <span>Description</span>
              <input v-model="form.description" type="text" required maxlength="500">
            </label>
            <label class="fld">
              <span>Qty / hours</span>
              <input v-model="form.quantity" type="text" required inputmode="decimal">
            </label>
            <label class="fld">
              <span>Rate</span>
              <input v-model="form.unitPrice" type="text" required inputmode="decimal">
            </label>
          </div>

          <label class="fld">
            <span>Additional notes (optional)</span>
            <textarea
              v-model="form.notes"
              rows="3"
              maxlength="2000"
              placeholder="Explain why this line should be corrected…"
            />
          </label>

          <p v-if="success" class="callout info">{{ success }}</p>
          <p v-if="error" class="help" style="color:#dc2626;">{{ error }}</p>
        </div>
        <div class="mfoot">
          <button type="button" class="btn" @click="close">Cancel</button>
          <button type="button" class="btn primary" :disabled="submitting" @click="submit">
            {{ submitting ? 'Sending…' : 'Send correction request' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.correction-grid {
  display: grid;
  grid-template-columns: 1fr 120px 120px;
  gap: 12px;
  margin-bottom: 14px;
}
@media (max-width: 640px) {
  .correction-grid {
    grid-template-columns: 1fr;
  }
}
</style>
