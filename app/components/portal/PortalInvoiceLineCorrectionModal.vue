<script setup lang="ts">
import { moneyDisplay } from '~/utils/invoices-ui'
import {
  portalInvoiceLineCorrectionDescription,
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
    lineAmount: string
  } | null
}>()

const emit = defineEmits<{ submitted: [] }>()

const message = ref('')
const submitting = ref(false)
const error = ref('')
const success = ref('')

watch(open, (isOpen) => {
  if (!isOpen) {
    message.value = ''
    error.value = ''
    success.value = ''
    submitting.value = false
  }
})

function close() {
  open.value = false
}

async function submit() {
  if (!props.line) return
  if (!message.value.trim()) {
    error.value = 'Describe what needs to be corrected.'
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
        description: portalInvoiceLineCorrectionDescription(
          props.invoiceNumberFormatted,
          props.line,
          message.value,
        ),
      },
    })
    success.value = 'Correction request sent — the shop will review.'
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
            Describe what is wrong with this line item. The shop will review your request.
          </p>
          <label class="fld">
            <span>What needs to be corrected?</span>
            <textarea
              v-model="message"
              rows="4"
              required
              placeholder="Explain the issue with this charge…"
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
